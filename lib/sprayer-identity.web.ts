import AsyncStorage from '@react-native-async-storage/async-storage';
import {PhoneIdentity} from '@/utils/sprayer-model';
const key='jspl.sprayer.offline-access';
export async function getPhoneIdentity():Promise<PhoneIdentity|null>{const raw=await AsyncStorage.getItem(key);return raw?JSON.parse(raw):null;}
export async function setPhoneIdentity(value:PhoneIdentity){await AsyncStorage.setItem(key,JSON.stringify(value));}
export async function clearPhoneIdentity(){await AsyncStorage.removeItem(key);}
