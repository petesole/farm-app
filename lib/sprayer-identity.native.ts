import * as SecureStore from 'expo-secure-store';
import {PhoneIdentity} from '@/utils/sprayer-model';
const key='jspl.sprayer.offline-access';
// Written only after the dedicated server has verified the current authenticated role.
export async function getPhoneIdentity():Promise<PhoneIdentity|null>{const raw=await SecureStore.getItemAsync(key);return raw?JSON.parse(raw):null;}
export async function setPhoneIdentity(value:PhoneIdentity){await SecureStore.setItemAsync(key,JSON.stringify(value),{keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY});}
export async function clearPhoneIdentity(){await SecureStore.deleteItemAsync(key);}
