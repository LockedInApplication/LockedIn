export function safeDiscoveryDestination(path:string):string|null{
  if(!path.startsWith("/") || path.startsWith("//") || path.includes("\\"))return null;
  const url=new URL(path,"https://lockedin.invalid");
  if(url.origin==="https://lockedin.invalid"&&url.pathname==="/verify-email"&&url.search==="?pending=1"&&!url.hash)return "/verify-email?pending=1";
  if(url.origin!=="https://lockedin.invalid" || !(/^\/(journey|profile|discover(?:\/(?:profile|matching))?|connections(?:\/[A-Za-z0-9-]+)?|messages\/[A-Za-z0-9-]+|your-space|discovery\/moderation)$/.test(url.pathname)))return null;
  return `${url.pathname}${url.search}${url.hash}`;
}
