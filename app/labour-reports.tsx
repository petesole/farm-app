import {useLocalSearchParams} from 'expo-router';
import SeasonReport from '@/components/jspl/LabourSeasonReport';
import DateReport from './labour-date-report';
export default function LabourReports(){const params=useLocalSearchParams<{mode?:string}>();return params.mode==='ao'?<DateReport/>:<SeasonReport/>}
