import {
  EllipsisHorizontalIcon,
  ChatBubbleLeftRightIcon,
  ShieldCheckIcon,
  ShieldExclamationIcon,
  GlobeAltIcon,
  CpuChipIcon,
  MagnifyingGlassIcon,
  ClipboardDocumentListIcon,
  UserGroupIcon,
  InformationCircleIcon,
  ArrowLeftIcon,
  ArrowUpRightIcon,
  PaperAirplaneIcon,
  XMarkIcon,
  PlusIcon,
  DocumentDuplicateIcon,
  PauseIcon,
  PlayIcon,
  EyeIcon,
  ArrowRightStartOnRectangleIcon,
  CheckBadgeIcon,
  Cog6ToothIcon,
} from "@heroicons/react/24/outline";

type HeroIcon = typeof ChatBubbleLeftRightIcon;
const icon = (Component: HeroIcon) =>
  function AppIcon() {
    return <Component className="ic" aria-hidden="true" />;
  };
export const Icon = {
  more: icon(EllipsisHorizontalIcon),
  chats: icon(ChatBubbleLeftRightIcon),
  shield: icon(ShieldCheckIcon),
  alert: icon(ShieldExclamationIcon),
  compass: icon(GlobeAltIcon),
  chip: icon(CpuChipIcon),
  search: icon(MagnifyingGlassIcon),
  task: icon(ClipboardDocumentListIcon),
  group: icon(UserGroupIcon),
  info: icon(InformationCircleIcon),
  settings: icon(Cog6ToothIcon),
  back: icon(ArrowLeftIcon),
  send: icon(PaperAirplaneIcon),
  open: icon(ArrowUpRightIcon),
  close: icon(XMarkIcon),
  plus: icon(PlusIcon),
  copy: icon(DocumentDuplicateIcon),
  pause: icon(PauseIcon),
  play: icon(PlayIcon),
  eye: icon(EyeIcon),
  logout: icon(ArrowRightStartOnRectangleIcon),
};
export function Mark() {
  return <span className="wordmark">Ambasa</span>;
}
export function Verified() {
  return (
    <CheckBadgeIcon
      className="vf"
      aria-hidden={false}
      aria-label="Verified"
      role="img"
    />
  );
}
