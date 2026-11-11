"use client";
import {
  forwardRef,
  useCallback,
  useRef,
  type KeyboardEvent,
  type Ref,
} from "react";
import { ImExit } from "react-icons/im";
import { FaSearch } from "react-icons/fa";
import { FaHeart, FaTrophy } from "react-icons/fa6";
import { useArrowFocusNavigation } from "@/hooks/useArrowFocusNavigation";

type AppSidebarProps = {
  onLogout: () => void;
  faded?: boolean;
  onSearch?: () => void;
  onLeaderboard?: () => void;
  onFavorites?: () => void;
  searchButtonRef?: Ref<HTMLButtonElement>;
  leaderboardButtonRef?: Ref<HTMLButtonElement>;
  /** ← returns to banner next or song when set by main content navigation */
  onSidebarReturnKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void;
};

function mergeButtonRef(
  external: Ref<HTMLButtonElement> | undefined,
  slot: (element: HTMLButtonElement | null) => void,
) {
  return (element: HTMLButtonElement | null) => {
    slot(element);
    if (!external) return;
    if (typeof external === "function") external(element);
    else external.current = element;
  };
}

export default function AppSidebar({
  onSearch,
  onLeaderboard,
  onFavorites,
  onLogout,
  faded = false,
  searchButtonRef,
  leaderboardButtonRef,
  onSidebarReturnKeyDown,
}: AppSidebarProps) {
  const sidebarButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const onSidebarArrowKeyDown = useArrowFocusNavigation(sidebarButtonRefs);

  const handleSidebarButtonKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      onSidebarReturnKeyDown?.(event);
      if (event.defaultPrevented) return;
      onSidebarArrowKeyDown(event);
    },
    [onSidebarReturnKeyDown, onSidebarArrowKeyDown],
  );

  const setSidebarButtonRef = useCallback(
    (index: number) => (element: HTMLButtonElement | null) => {
      sidebarButtonRefs.current[index] = element;
    },
    [],
  );

  const searchRef = mergeButtonRef(
    searchButtonRef,
    setSidebarButtonRef(0),
  );
  const leaderboardRef = mergeButtonRef(
    leaderboardButtonRef,
    setSidebarButtonRef(2),
  );

  return (
    <aside
      dir="ltr"
      aria-hidden={faded}
      className={`app-sidebar relative mb-3 flex min-h-0 shrink-0 flex-col items-start self-stretch overflow-visible text-white transition-opacity duration-500 ${faded ? "pointer-events-none opacity-0" : "opacity-100"} `}
    >
      <nav
        className="app-sidebar__nav relative z-10 flex min-h-0 w-full flex-1 flex-col items-start"
        aria-label="Sidebar"
      >
        <DarkMenuButton
          ref={searchRef}
          icon={<FaSearch />}
          label="جستجو"
          onClick={onSearch}
          onKeyDown={handleSidebarButtonKeyDown}
        />
        <DarkMenuButton
          ref={setSidebarButtonRef(1)}
          icon={<FaHeart />}
          label="لیست علاقمندی ها"
          onClick={onFavorites}
          onKeyDown={handleSidebarButtonKeyDown}
        />
        <DarkMenuButton
          ref={leaderboardRef}
          icon={<FaTrophy />}
          label="رتبه بندی"
          onClick={onLeaderboard}
          onKeyDown={handleSidebarButtonKeyDown}
        />
        <button
          type="button"
          ref={setSidebarButtonRef(3)}
          onKeyDown={handleSidebarButtonKeyDown}
          onClick={onLogout}
          className="app-sidebar__menu-btn app-sidebar__menu-btn--logout group mt-auto"
          aria-label="خروج"
          title="خروج"
        >
          <span className="app-sidebar__menu-icon">
            <ImExit />
          </span>
        </button>
      </nav>
    </aside>
  );
}

const DarkMenuButton = forwardRef<
  HTMLButtonElement,
  {
    icon: React.ReactNode;
    label: string;
    onClick?: () => void;
    onKeyDown?: React.ComponentProps<"button">["onKeyDown"];
  }
>(function DarkMenuButton({ icon, label, onClick, onKeyDown }, ref) {
  return (
    <button
      type="button"
      ref={ref}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className="app-sidebar__menu-btn group"
      aria-label={label}
      title={label}
    >
      <span className="app-sidebar__menu-icon">{icon}</span>
    </button>
  );
});
