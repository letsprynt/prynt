import Link from "next/link";
import { IconAlert } from "@/components/icons";

export default function NotFound() {
  return (
    <div className="board-state" style={{ marginTop: 60 }}>
      <div className="state-ico"><IconAlert size={30} /></div>
      <p>Page not found.</p>
      <p className="muted">The page you’re looking for doesn’t exist.</p>
      <Link href="/"><button>Back to tokens</button></Link>
    </div>
  );
}
