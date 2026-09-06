import Image from "next/image";

export default function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <Image src="/favicon.svg" alt="" width={21} height={21} />
    </span>
  );
}
