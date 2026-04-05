import BaseToast from "./BaseToast";

type SuccessToastProps = {
  title: string;
  message: string;
  className?: string;
};

export default function SuccessToast({ message, className }: SuccessToastProps) {
  return <BaseToast message={message} type="success" className={className} />;
}
