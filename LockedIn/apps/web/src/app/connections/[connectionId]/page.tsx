import ConnectionPage from "@/features/discovery/ConnectionPage";
export default async function Page({params}:{params:Promise<{connectionId:string}>}){const {connectionId}=await params;return <ConnectionPage connectionId={connectionId}/>;}
