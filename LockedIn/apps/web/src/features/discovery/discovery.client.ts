import {journeyRequest,JourneyApiError} from "@/lib/journey";
export async function discoveryRequest<T>(ownerId:string,path:string,init?:RequestInit):Promise<T>{
  if(!ownerId || !path.startsWith("/api/discovery/") || path.includes("\\"))throw new Error("Invalid discovery request");
  const headers=new Headers(init?.headers);
  if(init?.method && init.method.toUpperCase()!=="GET")headers.set("X-Discovery-Owner",ownerId);
  const envelope=await journeyRequest<{ownerId:string;value:T}>(path,{...init,headers,cache:"no-store"});
  if(envelope?.ownerId!==ownerId || !("value" in envelope))throw new JourneyApiError("Your account changed. Reload before continuing.",409);
  return envelope.value;
}
