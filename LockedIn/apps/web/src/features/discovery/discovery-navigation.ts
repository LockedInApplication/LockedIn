export function safeDiscoveryDestination(path:string):string|null{
  if(!path.startsWith("/") || path.startsWith("//") || path.includes("\\"))return null;
  const url=new URL(path,"https://lockedin.invalid");
  if(url.origin!=="https://lockedin.invalid" || !(/^\/(journey|profile|discover(?:\/profile)?|connections(?:\/[A-Za-z0-9-]+)?|your-space|discovery\/moderation)$/.test(url.pathname)))return null;
  return `${url.pathname}${url.search}${url.hash}`;
}
export function discoveryEntry(me:{canDiscover:boolean;hasHistory:boolean}|null):{label:string;path:string}|null{
  return me?.canDiscover?{label:"Explore people",path:"/discover"}:me?.hasHistory?{label:"Starter connections",path:"/connections"}:null;
}
