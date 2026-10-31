import { Link } from "react-router";
import { HeaderIconLink, PageHeader } from "./shell/PageHeader";
import { Icon } from "./shell/icons";
import styles from "./Placeholder.module.css";

interface PlaceholderProps {
  title: string;
  issue: string;
  /** Title in the phone header when it differs from the desktop one. */
  phoneTitle?: string;
  back?: string;
  /** The home screen: settings and review buttons in the phone header. */
  home?: boolean;
  /** No shell (sign-in). */
  bare?: boolean;
}

export function Placeholder({ title, issue, phoneTitle, back, home, bare }: PlaceholderProps) {
  const card = (
    <section className={styles.card}>
      <h2 className={styles.heading}>{title}</h2>
      <p className={styles.text}>This screen is built in [{issue}].</p>
    </section>
  );

  if (bare) {
    return <main className={styles.bare}>{card}</main>;
  }

  return (
    <>
      <PageHeader
        title={title}
        phoneTitle={phoneTitle}
        back={back}
        leading={
          home && (
            <HeaderIconLink to="/settings" label="Settings">
              <Icon name="gear" />
            </HeaderIconLink>
          )
        }
        trailing={
          home && (
            <HeaderIconLink to="/review" label="Review">
              <Icon name="shield" />
            </HeaderIconLink>
          )
        }
      />
      <div className={styles.content}>{card}</div>
    </>
  );
}

export function NotFound() {
  return (
    <>
      <PageHeader title="Not found" back="/" />
      <div className={styles.content}>
        <section className={styles.card}>
          <h2 className={styles.heading}>This page does not exist</h2>
          <p className={styles.text}>
            <Link to="/">Back to the overview</Link>
          </p>
        </section>
      </div>
    </>
  );
}
