"use client";
import {useRouter} from "next/navigation";
import {useProfileLeaveGuard} from "@/features/profile/use-profile-leave-guard";
import {safeDiscoveryDestination} from "./discovery-navigation";
export function useDiscoveryNavigation(dirty:boolean,currentPath:string){
  const router=useRouter(),guard=useProfileLeaveGuard(dirty,currentPath);
  const leave=async(path:string)=>{const destination=safeDiscoveryDestination(path);if(!destination)return false;if(!await guard.confirmLeave())return false;router.push(destination);return true;};
  return{...guard,leave};
}
