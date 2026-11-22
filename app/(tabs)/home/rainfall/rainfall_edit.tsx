import { Redirect } from "expo-router";

export default function RainfallHistoryRedirect() {
  return <Redirect href={{pathname:"/home/rainfall/rainfall_record",params:{mode:"edit"}}} />;
}
