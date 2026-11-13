import {SPRAYER_APP} from "@/utils/sprayer-config";
import { Redirect } from "expo-router";

export default function Index() {
  return <Redirect href={SPRAYER_APP?"/sprayer":"/login"} />;
}