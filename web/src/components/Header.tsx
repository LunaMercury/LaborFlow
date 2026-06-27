import { useState } from "react";
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

      <nav className={styles.menuBar} aria-label="주요 메뉴">
        {menuItems.map((menuItem) => {
          const isActive =
            currentPath === menuItem.path ||
            menuItem.children?.some((child) => child.path === currentPath);

          return (
            <div
              className={styles.menuItemWrapper}
              key={menuItem.path}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                  setOpenMenuPath(null);
                }
              }}
              onFocus={() => {
                if (menuItem.children) {
                  setOpenMenuPath(menuItem.path);
                }
              }}
              onMouseEnter={() => {
                if (menuItem.children) {
                  setOpenMenuPath(menuItem.path);
                }
              }}
              onMouseLeave={() => setOpenMenuPath(null)}
            >
              <button
                aria-current={isActive ? "page" : undefined}
                aria-haspopup={menuItem.children ? "menu" : undefined}
                className={`${styles.menuButton} ${
                  isActive ? styles.activeMenuButton : ""
                }`}
                type="button"
                onClick={() => handleNavigate(menuItem.path)}
              >
                {menuItem.label}
              </button>

              {menuItem.children ? (
                <div
                  className={`${styles.menuDropdown} ${
                    openMenuPath === menuItem.path ? styles.openMenuDropdown : ""
                  }`}
                  role="menu"
                >
                  {menuItem.children.map((child) => (
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
            </div>
          );
        })}
      </nav>
    </>
  );
}
