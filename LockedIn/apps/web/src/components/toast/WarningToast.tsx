import BaseToast from "./BaseToast";

type WarningToastProps = {
  title: string;
  message: string;
  className?: string;
};

export default function WarningToast({ message, className }: WarningToastProps) {
  return <BaseToast message={message} type="warning" className={className} />;
}
