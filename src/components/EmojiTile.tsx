import { categoryColourVar } from "@/lib/categoryColours";
import styles from "./EmojiTile.module.css";

interface EmojiTileProps {
  emoji: string;
  /** Category colour key (cat-1 … cat-12) for a tinted tile; plain inset tile when omitted. */
  colour?: string;
  size?: "sm" | "md" | "lg";
}

/** Decorative: the name next to it carries the meaning. */
export function EmojiTile({ emoji, colour, size = "md" }: EmojiTileProps) {
  return (
    <span
      aria-hidden="true"
      className={`${styles.tile} ${styles[size]}`}
      style={colour ? { background: categoryColourVar(colour, "tint") } : undefined}
    >
      {emoji}
    </span>
  );
}
