import { getRemoteConfig, fetchAndActivate, getValue } from 'firebase/remote-config';
import { app } from './firebase';

let cachedEmail: string | undefined;

export async function fetchAdminEmail(): Promise<string | undefined> {
  if (cachedEmail) {
    return cachedEmail;
  }

  if (process.env.NEXT_PUBLIC_ADMIN_EMAIL) {
    cachedEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
    return cachedEmail;
  }

  try {
    const remoteConfig = getRemoteConfig(app);
    remoteConfig.settings.minimumFetchIntervalMillis = 3600000;
    await fetchAndActivate(remoteConfig);
    const email = getValue(remoteConfig, 'admin_email').asString();
    cachedEmail = email;
    return email;
  } catch (error) {
    console.error('Failed to load admin email from Remote Config', error);
    return undefined;
  }
}
