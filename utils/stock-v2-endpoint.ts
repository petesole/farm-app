// The hosted development build can use an isolated test service without replacing the existing service.
export const stockV2Endpoint=process.env.EXPO_PUBLIC_STOCK_V2_ENDPOINT||'https://azxaymxnicrsezeoxiau.supabase.co/functions/v1/stock-v2-demo-workflow';
