import { Link } from 'react-router';
import { ShellIcon, type ShellIconName } from '../ui/ShellIcon';
import './LandingPage.css';
import { InstitutionalContext } from '../teacher-portal/InstitutionalContext';

const capabilities: { icon: ShellIconName; companionIcon?: ShellIconName; title: string; description: string }[] = [
  { icon: 'teachers', title: 'ملفات الأساتذة', description: 'تنظيم البيانات المهنية ومتابعة ملفات الأساتذة.' },
  { icon: 'institutions', title: 'المؤسسات التربوية', description: 'إدارة المؤسسات ضمن نطاق المقاطعات المسندة.' },
  { icon: 'visits', title: 'الزيارات الميدانية', description: 'تخطيط الزيارات التربوية وتوثيقها.' },
  { icon: 'follow-ups', companionIcon: 'reports', title: 'المتابعة والتقارير', description: 'متابعة الإجراءات والاطلاع على التقارير البيداغوجية.' },
];

export function LandingPage() {
  return (
    <main className="landing-page" dir="rtl" id="main-content">
      <header className="landing-header">
        <Link className="landing-brand" to="/" aria-label="منصة مفتش التربية البدنية والرياضية — الرئيسية">
          <span className="landing-brand__mark"><ShellIcon name="shield" /></span>
          <span className="landing-brand__name">منصة المفتش</span>
        </Link>
        <Link className="landing-header__login" to="/login">
          <span>دخول المفتش</span><ShellIcon name="login" />
        </Link>
      </header>

      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-hero__copy">
          <span className="landing-eyebrow"><span /> فضاء مهني للمرافقة البيداغوجية</span>
          <h1 id="landing-title">منصة مفتش التربية البدنية والرياضية</h1>
          <p className="landing-hero__description">
            مساحة عمل تساعد المفتش على تنظيم بيانات الأساتذة والمؤسسات، وتخطيط الزيارات، ومتابعة التقارير البيداغوجية.
          </p>
          <div className="landing-hero__actions">
            <Link className="ui-button ui-button--primary ui-button--normal landing-primary-action" to="/login">دخول فضاء المفتش<ShellIcon name="login" /></Link>
            <Link className="landing-secondary-action" to="/teacher/login">دخول مساحة الأستاذ<ShellIcon name="teachers" /></Link>
            <a className="landing-secondary-action" href="#landing-capabilities">اكتشف مساحات العمل<ShellIcon name="arrow-down" /></a>
          </div>
          <p className="landing-hero__note"><ShellIcon name="lock" /> فضاء الدخول مخصص للمفتشين المسجلين.</p>
        </div>

        <div className="landing-visual" aria-hidden="true">
          <div className="landing-visual__orbit landing-visual__orbit--outer" />
          <div className="landing-visual__orbit landing-visual__orbit--inner" />
          <div className="landing-visual__seal"><ShellIcon name="shield" /></div>
          <div className="landing-visual__caption">
            <span className="landing-visual__caption-mark"><ShellIcon name="dashboard" /></span>
            <span><strong>مساحات عمل مترابطة</strong><small>للإشراف والمتابعة البيداغوجية</small></span>
            <span className="landing-visual__caption-status" />
          </div>
          <span className="landing-visual__spark landing-visual__spark--one" />
          <span className="landing-visual__spark landing-visual__spark--two" />
        </div>
      </section>

      <section className="landing-capabilities" id="landing-capabilities" aria-labelledby="landing-capabilities-title">
        <div className="landing-section-heading">
          <div><span className="landing-section-heading__eyebrow">أدوات العمل</span><h2 id="landing-capabilities-title">كل ما تحتاجه لمتابعة مهامك</h2></div>
          <p>تجربة موحدة لإدارة العمل الإشرافي اليومي.</p>
        </div>
        <div className="landing-capability-grid">
          {capabilities.map((capability, index) => (
            <article className="landing-capability" key={capability.title}>
              <span className="landing-capability__index">0{index + 1}</span>
              <span className={`landing-capability__icon${capability.companionIcon ? ' landing-capability__icon--paired' : ''}`}><ShellIcon name={capability.icon} />{capability.companionIcon ? <ShellIcon name={capability.companionIcon} /> : null}</span>
              <h3>{capability.title}</h3>
              <p>{capability.description}</p>
              <span className="landing-capability__line" />
            </article>
          ))}
        </div>
      </section>

      <footer className="landing-footer">
        <InstitutionalContext />
        <span>منصة مفتش التربية البدنية والرياضية</span>
        <span>فضاء مهني للمرافقة البيداغوجية</span>
      </footer>
    </main>
  );
}
