/**
 * CommitCraft — license.ts
 * Offline Ed25519 license key validation.
 *
 * License key format (URL-safe base64):
 *   base64url( JSON({ email_hash, expiry, tier }) + "." + base64url(ed25519_signature) )
 *
 * The public key is embedded here. The private key never leaves the license server.
 */

import * as crypto from 'crypto';
import * as vscode from 'vscode';

// Ed25519 public key (DER-encoded, base64). The corresponding private key is used
// to sign license keys on the license server and is never stored in this repository.
const PUBLIC_KEY_BASE64 =
  'MCowBQYDK2VwAyEAn4eH/lRO4yBWRbAdeHwcSdVn27OhQUSYTgkHcd42Z28=';

const TRIAL_DAYS = 14;
const REMINDER_START_DAY = 7;

const STATE_KEY_LICENSE = 'commitcraft.licenseKey';
const STATE_KEY_FIRST_RUN = 'commitcraft.firstRunDate';

export interface LicensePayload {
  emailHash: string;
  expiry: string | 'perpetual';
  tier: 'personal' | 'team';
}

export type LicenseState =
  | { status: 'valid'; payload: LicensePayload }
  | { status: 'trial'; daysRemaining: number }
  | { status: 'expired_trial' }
  | { status: 'invalid'; reason: string };

/**
 * Verifies an Ed25519 license key.
 * Key format: <base64url(payload_json)>.<base64url(signature)>
 */
export function verifyLicenseKey(licenseKey: string): LicenseState {
  try {
    const parts = licenseKey.trim().split('.');
    if (parts.length !== 2) {
      return { status: 'invalid', reason: 'Malformed key format' };
    }

    const [payloadB64, signatureB64] = parts;

    const payloadBytes = Buffer.from(payloadB64, 'base64url');
    const signatureBytes = Buffer.from(signatureB64, 'base64url');
    const publicKeyDer = Buffer.from(PUBLIC_KEY_BASE64, 'base64');

    // Verify using Node.js crypto (Ed25519, available in Node 12+)
    const publicKey = crypto.createPublicKey({
      key: publicKeyDer,
      format: 'der',
      type: 'spki',
    });

    const isValid = crypto.verify(
      null,         // algorithm: null uses key's built-in algorithm (Ed25519)
      payloadBytes,
      publicKey,
      signatureBytes,
    );

    if (!isValid) {
      return { status: 'invalid', reason: 'Signature verification failed' };
    }

    const payload = JSON.parse(payloadBytes.toString('utf-8')) as LicensePayload;

    // Check expiry
    if (payload.expiry !== 'perpetual') {
      const expiryDate = new Date(payload.expiry);
      if (isNaN(expiryDate.getTime())) {
        return { status: 'invalid', reason: 'Invalid expiry date in key' };
      }
      if (expiryDate < new Date()) {
        return { status: 'invalid', reason: 'License key has expired' };
      }
    }

    return { status: 'valid', payload };
  } catch (err) {
    return {
      status: 'invalid',
      reason: err instanceof Error ? err.message : 'Unknown error during verification',
    };
  }
}

/**
 * Gets the current license state from stored key or trial status.
 */
export function getLicenseState(context: vscode.ExtensionContext): LicenseState {
  const storedKey = context.globalState.get<string>(STATE_KEY_LICENSE);

  if (storedKey) {
    return verifyLicenseKey(storedKey);
  }

  // No license key — check trial status
  let firstRunDate = context.globalState.get<string>(STATE_KEY_FIRST_RUN);
  if (!firstRunDate) {
    firstRunDate = new Date().toISOString();
    context.globalState.update(STATE_KEY_FIRST_RUN, firstRunDate);
  }

  const firstRun = new Date(firstRunDate);
  const now = new Date();
  const daysSinceFirstRun = Math.floor(
    (now.getTime() - firstRun.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (daysSinceFirstRun >= TRIAL_DAYS) {
    return { status: 'expired_trial' };
  }

  return { status: 'trial', daysRemaining: TRIAL_DAYS - daysSinceFirstRun };
}

/**
 * Prompts the user to enter a license key and validates it.
 * Stores valid keys in globalState.
 */
export async function promptForLicenseKey(
  context: vscode.ExtensionContext,
): Promise<boolean> {
  const key = await vscode.window.showInputBox({
    prompt: 'Enter your CommitCraft license key',
    placeHolder: 'xxxxxxxx.xxxxxxxx',
    ignoreFocusOut: true,
    password: false,
  });

  if (!key) {
    return false;
  }

  const result = verifyLicenseKey(key);

  if (result.status === 'valid') {
    await context.globalState.update(STATE_KEY_LICENSE, key);
    vscode.window.showInformationMessage('CommitCraft license activated. Thank you!');
    return true;
  } else {
    const reason = result.status === 'invalid' ? result.reason : 'Unknown error';
    vscode.window.showErrorMessage(
      `Invalid license key: ${reason}. ` +
      `Purchase a key at https://commitcraft.dev`,
    );
    return false;
  }
}

/**
 * Checks license state and blocks or warns accordingly.
 * Returns true if the extension is allowed to run, false if blocked.
 */
export async function checkLicenseGate(
  context: vscode.ExtensionContext,
): Promise<boolean> {
  const state = getLicenseState(context);

  if (state.status === 'valid') {
    return true;
  }

  if (state.status === 'trial') {
    // Show a non-blocking reminder after day 7
    if (state.daysRemaining <= TRIAL_DAYS - REMINDER_START_DAY) {
      vscode.window.showInformationMessage(
        `CommitCraft trial: ${state.daysRemaining} day${state.daysRemaining === 1 ? '' : 's'} remaining. ` +
        `Get a license at https://commitcraft.dev`,
        'Enter License Key',
      ).then(action => {
        if (action === 'Enter License Key') {
          promptForLicenseKey(context);
        }
      });
    }
    return true;
  }

  if (state.status === 'expired_trial') {
    const action = await vscode.window.showErrorMessage(
      'Your CommitCraft trial has expired. Purchase a license to continue using CommitCraft.',
      'Buy License',
      'Enter License Key',
    );

    if (action === 'Buy License') {
      vscode.env.openExternal(vscode.Uri.parse('https://commitcraft.dev'));
    } else if (action === 'Enter License Key') {
      return await promptForLicenseKey(context);
    }
    return false;
  }

  if (state.status === 'invalid') {
    const invalidState = state;
    const action = await vscode.window.showErrorMessage(
      `CommitCraft license error: ${invalidState.reason}. ` +
      `Please re-enter your license key.`,
      'Enter License Key',
    );

    if (action === 'Enter License Key') {
      return await promptForLicenseKey(context);
    }

    return false;
  }

  return false;
}
