import { useEffect, useRef, useState } from "react";
import styles from "../App.module.css";
import { menuItems, profileMenuItems } from "../data/navigation";

type HeaderProps = {
  currentPath: string;
  isLoggedIn: boolean;
  onLogout: () => void;
  onNavigate: (path: string) => void;
};

export function Header({ currentPath, isLoggedIn, onLogout, onNavigate }: HeaderProps) {
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [openMenuPath, setOpenMenuPath] = useState<string | null>(null);
  const [dropdownLeft, setDropdownLeft] = useState(0);
  const menuBarRef = useRef<HTMLElement>(null);
  const menuDropdownRef = useRef<HTMLDivElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const openMenu = menuItems.find((item) => item.path === openMenuPath);

  useEffect(() => {
    const closeDropdown = () => setOpenMenuPath(null);
    window.addEventListener("resize", closeDropdown);
    return () => window.removeEventListener("resize", closeDropdown);
  }, []);

  const showMenu = (path: string, wrapper: HTMLDivElement) => {
    const item = menuItems.find((menu) => menu.path === path);
    if (!item?.children) {
      setOpenMenuPath(null);
      return;
    }
    const bar = menuBarRef.current?.getBoundingClientRect();
    const trigger = wrapper.getBoundingClientRect();
    if (!bar) return;
    menuTriggerRef.current = wrapper.querySelector("button");
    const center = trigger.left - bar.left + trigger.width / 2;
    setDropdownLeft(Math.max(80, Math.min(bar.width - 80, center)));
    setOpenMenuPath(path);
  };

  const handleNavigate = (path: string) => {
    setIsProfileMenuOpen(false);
    setOpenMenuPath(null);
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    onNavigate(path);
  };

  return (
    <>
      <header className={styles.siteHeader}>
        <a
          className={styles.logoLink}
          href="/"
          aria-label="LaborFlow 메인 페이지"
          onClick={(event) => {
            event.preventDefault();
            handleNavigate("/");
          }}
        >
          LaborFlow
        </a>

        {isLoggedIn ? (
          <div className={styles.profileMenuContainer}>
            <button
              aria-expanded={isProfileMenuOpen}
              aria-haspopup="menu"
              className={styles.profileMenuButton}
              type="button"
              onClick={() => setIsProfileMenuOpen((current) => !current)}
            >
              프로필
            </button>

            {isProfileMenuOpen ? (
              <div className={styles.profileDropdown} role="menu">
                {profileMenuItems.map((item) => (
                  <button
                    className={styles.profileDropdownItem}
                    key={item.path}
                    role="menuitem"
                    type="button"
                    onClick={() => handleNavigate(item.path)}
                  >
                    {item.label}
                  </button>
                ))}
                <button
                  className={styles.profileDropdownItem}
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    setIsProfileMenuOpen(false);
                    onLogout();
                  }}
                >
                  로그아웃
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <nav className={styles.authLinks} aria-label="회원 메뉴">
            <a
              href="/login"
              onClick={(event) => {
                event.preventDefault();
                handleNavigate("/login");
              }}
            >
              로그인
            </a>
            <a href="/signup">회원가입</a>
          </nav>
        )}
      </header>

      <nav
        className={styles.menuBar}
        aria-label="주요 메뉴"
        ref={menuBarRef}
        onMouseLeave={() => setOpenMenuPath(null)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setOpenMenuPath(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && openMenuPath) {
            event.preventDefault();
            menuTriggerRef.current?.focus();
            setOpenMenuPath(null);
          }
        }}
      >
        <div className={styles.menuScroll} onScroll={() => setOpenMenuPath(null)}>
          {menuItems.map((menuItem) => {
            const isActive =
              currentPath === menuItem.path ||
              menuItem.children?.some((child) => child.path === currentPath);

            return (
              <div
                className={styles.menuItemWrapper}
                key={menuItem.path}
                onFocus={(event) => showMenu(menuItem.path, event.currentTarget)}
                onMouseEnter={(event) => showMenu(menuItem.path, event.currentTarget)}
              >
                <button
                  aria-current={isActive ? "page" : undefined}
                  aria-haspopup={menuItem.children ? "menu" : undefined}
                  aria-expanded={menuItem.children ? openMenuPath === menuItem.path : undefined}
                  aria-controls={menuItem.children ? "primary-menu-dropdown" : undefined}
                  className={`${styles.menuButton} ${
                    isActive ? styles.activeMenuButton : ""
                  }`}
                  type="button"
                  onClick={() => handleNavigate(menuItem.path)}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown" && menuItem.children) {
                      event.preventDefault();
                      showMenu(menuItem.path, event.currentTarget.parentElement as HTMLDivElement);
                      requestAnimationFrame(() => {
                        menuDropdownRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
                      });
                    }
                  }}
                >
                  {menuItem.label}
                </button>
              </div>
            );
          })}
        </div>
        {/* Flyouts stay outside the scroller to avoid overflow clipping. */}
        {openMenu?.children ? (
          <div
            className={`${styles.menuDropdown} ${styles.openMenuDropdown}`}
            id="primary-menu-dropdown"
            ref={menuDropdownRef}
            role="menu"
            aria-label={`${openMenu.label} 하위 메뉴`}
            style={{ left: dropdownLeft }}
          >
            {openMenu.children.map((child) => (
              <button
                className={`${styles.menuDropdownItem} ${
                  currentPath === child.path ? styles.activeMenuDropdownItem : ""
                }`}
                key={child.path}
                role="menuitem"
                type="button"
                onClick={() => handleNavigate(child.path)}
              >
                {child.label}
              </button>
            ))}
          </div>
        ) : null}
      </nav>
    </>
  );
}
