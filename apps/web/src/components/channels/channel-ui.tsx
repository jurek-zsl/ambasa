import { RadioIcon } from "@heroicons/react/24/outline";

export function ChannelGlyph({ large = false }: { large?: boolean }) {
  return (
    <span
      className={`public-channel-glyph${large ? " is-large" : ""}`}
      aria-hidden="true"
    >
      <RadioIcon />
      <span />
    </span>
  );
}

export function channelCadence(minutes: number) {
  if (minutes === 1440) return "Daily";
  if (minutes === 10080) return "Weekly";
  if (minutes >= 1440 && minutes % 1440 === 0)
    return `Every ${minutes / 1440} days`;
  if (minutes >= 60 && minutes % 60 === 0)
    return minutes === 60 ? "Hourly" : `Every ${minutes / 60} hours`;
  return `Every ${minutes} min`;
}
