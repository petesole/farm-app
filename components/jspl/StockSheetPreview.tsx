import {useMemo,useState} from 'react';
import {Image,Modal,Platform,ScrollView,Text,View} from 'react-native';
import {StockV2Header} from './StockV2Header';
import {StockButton,stockStyles as S} from './StockWorkflowControls';
import {downloadStockSheet,printStockSheet,SheetHeader,SheetItem,sortStockItems,stockCategory,stockSheetHTML} from '@/utils/stock-sheet';
export function StockSheetPreview({sheet,items,onClose}:{sheet:SheetHeader;items:SheetItem[];onClose:()=>void}){
 const [error,setError]=useState('');
 const sorted=useMemo(()=>sortStockItems(items),[items]);
 const html=useMemo(()=>{const asset=require('../../assets/images/jspl_farm_logo.png');const logo=typeof asset==='string'?asset:Image.resolveAssetSource?.(asset)?.uri;return stockSheetHTML(sheet,sorted,logo)},[sheet,sorted]);
 const print=()=>{setError('');try{printStockSheet(html,setError)}catch(e){setError((e as Error).message)}};
 return <Modal visible onRequestClose={onClose}><ScrollView contentContainerStyle={S.page}><StockV2Header title={'Stock Sheet '+sheet.take_number} backLabel="Close Preview" onStock={onClose}/>
 <View style={S.row}><StockButton title="Print Stock Sheet" onPress={print}/><StockButton title="Export to Excel (.xlsx)" onPress={()=>{try{downloadStockSheet(sheet,sorted)}catch(e){setError((e as Error).message)}}}/><Text style={S.text}>{sorted.length} items · {new Set(sorted.map(stockCategory)).size} categories</Text></View>
 {error?<Text style={S.error}>{error}</Text>:null}
 {Platform.OS==='web'?<iframe title="Stock sheet preview" srcDoc={html} style={{width:'100%',height:'75vh',minHeight:500,border:'1px solid #c7d9cb',background:'#fff'}}/>:<Text>Open this sheet in the web browser to print or export.</Text>}
 </ScrollView></Modal>;
}
