import { cn } from "@/lib/utils";

// Named presets (not just an array) so a user's chosen preset survives being
// stored as a stable code (users.avatar_color_code) rather than an array index.
const AVATAR_PALETTE: Record<string, string> = {
  lavender: "from-brand-light to-brand-purple",
  purple:   "from-brand-purple to-brand-violet",
  sky:      "from-brand-sky to-brand-navy",
  violet:   "from-brand-violet to-brand-deep",
  navy:     "from-brand-navy to-brand-purple",
  deep:     "from-brand-deep to-brand-sky",
};

export const AVATAR_COLOR_CODES = Object.keys(AVATAR_PALETTE);

function colorFor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  const codes = AVATAR_COLOR_CODES;
  return AVATAR_PALETTE[codes[Math.abs(hash) % codes.length]];
}

export function avatarGradientFor(colorCode: string | null | undefined, seed: string) {
  if (colorCode && AVATAR_PALETTE[colorCode]) return AVATAR_PALETTE[colorCode];
  return colorFor(seed);
}

export function Avatar({
  initials,
  size = 32,
  seed,
  colorCode,
  className,
}: {
  initials: string;
  size?: number;
  seed?: string;
  colorCode?: string | null;
  className?: string;
}) {
  const safeInitials = initials?.trim() || "?";
  const grad = avatarGradientFor(colorCode, seed ?? safeInitials);
  return (
    <span
      className={cn(
        "inline-grid place-items-center rounded-full text-white font-bold border-2 border-white",
        `bg-gradient-to-br ${grad}`,
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      aria-hidden
    >
      {safeInitials.slice(0, 2)}
    </span>
  );
}

export function AvatarStack({ users }: { users: { initials: string; userId: string }[] }) {
  const visible = users.slice(0, 4);
  return (
    <div className="flex items-center">
      {visible.map((u, i) => (
        <Avatar
          key={u.userId}
          initials={u.initials}
          seed={u.userId}
          size={26}
          className={i === 0 ? "" : "-ml-2"}
        />
      ))}
      {users.length > visible.length && (
        <span className="ml-1 text-xs font-semibold text-ink-soft">+{users.length - visible.length}</span>
      )}
    </div>
  );
}
