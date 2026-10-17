import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Bell,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FileCheck2,
  FileText,
  FolderLock,
  HelpCircle,
  LayoutDashboard,
  Leaf,
  LoaderCircle,
  LogOut,
  Plus,
  Search,
  ShieldCheck,
  UploadCloud,
  Users,
  X,
  Settings2,
  AlertCircle,
  RefreshCw,
  Menu,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { PortalData, Staff, Submission, Role, Booking } from './domain';
import {
  balance,
  csv,
  errorMessage,
  evidenceSchema,
  formatBytes,
  formatDate,
  initials,
  today,
  validateBooking,
  validateFiles,
} from './domain';
import type { Repository } from './repository';
import { createSupabaseRepository, demoEnabled, supabase } from './repository';
import { createDemoRepository } from './demo';
import { exportBackup, saveBlob, verifyBackup } from './backup';
import type { BackupSummary } from './backup';

type Page = 'overview' | 'staff' | 'documents' | 'calendar' | 'backup' | 'access' | 'help';
const pages: { id: Page; label: string; icon: LucideIcon; director?: boolean }[] = [
  { id: 'overview', label: 'Visão geral', icon: LayoutDashboard },
  { id: 'staff', label: 'Servidores', icon: Users, director: true },
  { id: 'documents', label: 'Comprovantes', icon: FileText },
  { id: 'calendar', label: 'Folgas e datas', icon: CalendarDays },
  { id: 'backup', label: 'Relatórios e backup', icon: FolderLock, director: true },
  { id: 'access', label: 'Acessos', icon: ShieldCheck, director: true },
];
const statusLabel = {
  pending: 'Aguardando análise',
  approved: 'Aprovado',
  changes_requested: 'Correção solicitada',
  draft: 'Rascunho',
  reserved: 'Agendada',
  used: 'Usufruída',
  cancelled: 'Cancelada',
};
function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand">
      <span className="brand-mark">
        <ClipboardCheck size={23} strokeWidth={1.5} />
      </span>
      {!compact && (
        <span>
          Portal Saldo<span>Eleitoral</span>
        </span>
      )}
    </div>
  );
}
function GoogleIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.94a5.09 5.09 0 0 1-2.2 3.34v2.77h3.56c2.08-1.92 3.3-4.75 3.3-7.94Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.77c-.98.66-2.23 1.06-3.72 1.06-2.87 0-5.3-1.94-6.17-4.55H2.15v2.86A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.83 14.08a6.6 6.6 0 0 1 0-4.16V7.06H2.15a11 11 0 0 0 0 9.88l3.68-2.86Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.37c1.62 0 3.07.56 4.21 1.66l3.16-3.16A10.6 10.6 0 0 0 12 1a11 11 0 0 0-9.85 6.06l3.68 2.86C6.7 7.3 9.13 5.37 12 5.37Z"
      />
    </svg>
  );
}
function Button({
  children,
  icon: Icon,
  secondary,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: LucideIcon; secondary?: boolean }) {
  return (
    <button className={secondary ? 'button secondary' : 'button'} {...props}>
      {Icon && <Icon size={17} />}
      {children}
    </button>
  );
}
function Badge({ status }: { status: keyof typeof statusLabel }) {
  return (
    <span className={`badge ${status}`}>
      <span />
      {statusLabel[status]}
    </span>
  );
}
function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="notice">
      <ShieldCheck size={19} />
      <div>{children}</div>
    </div>
  );
}
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty">
      <CheckCheck size={30} strokeWidth={1.2} />
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

function Modal({
  title,
  children,
  close,
  busy = false,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  busy?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current!;
    node.showModal();
    return () => node.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="modal"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) close();
      }}
      aria-labelledby="modal-title"
    >
      <div className="modal-head">
        <h2 id="modal-title">{title}</h2>
        <button className="icon-button" onClick={close} disabled={busy} aria-label="Fechar janela">
          <X size={21} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export function App() {
  const [repo, setRepo] = useState<Repository | null>(null);
  const [checking, setChecking] = useState(!!supabase);
  const [authError, setAuthError] = useState('');
  useEffect(() => {
    if (!supabase) return;
    let live = true;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (live) {
        setRepo(session ? createSupabaseRepository(supabase!) : null);
        setChecking(false);
      }
    });
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (live) {
          if (error) setAuthError('Não foi possível verificar sua sessão. Tente entrar novamente.');
          setRepo(data.session ? createSupabaseRepository(supabase!) : null);
          setChecking(false);
        }
      })
      .catch(() => {
        if (live) {
          setChecking(false);
          setAuthError('Serviço de acesso indisponível. Tente novamente em instantes.');
        }
      });
    return () => {
      live = false;
      subscription.unsubscribe();
    };
  }, []);
  const login = async () => {
    if (!supabase) return;
    setChecking(true);
    setAuthError('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin, queryParams: { prompt: 'select_account' } },
    });
    if (error) {
      setAuthError('Não foi possível iniciar o acesso Google. Tente novamente.');
      setChecking(false);
    }
  };
  if (checking)
    return (
      <main className="loading-page">
        <Brand />
        <LoaderCircle className="spin" />
        <p>Preparando seu acesso…</p>
      </main>
    );
  if (repo)
    return (
      <Portal
        key={repo.mode}
        repo={repo}
        exit={async () => {
          if (repo.mode === 'supabase') await supabase?.auth.signOut();
          setRepo(null);
        }}
      />
    );
  return (
    <Landing login={login} error={authError} demo={(role) => setRepo(createDemoRepository(role))} />
  );
}

function Landing({
  login,
  error,
  demo,
}: {
  login: () => void;
  error: string;
  demo: (role: Role) => void;
}) {
  const [role, setRole] = useState<Role>('staff');
  const [privacy, setPrivacy] = useState(false);
  return (
    <div className="landing">
      <header className="landing-header">
        <Brand />
        <span className="landing-tag">
          <ShieldCheck size={15} /> Acesso restrito à comunidade escolar
        </span>
      </header>
      <main className="landing-main">
        <section className="landing-copy">
          <div className="eyebrow">
            <span /> CONTROLE DE FOLGAS · ELEIÇÕES 2026
          </div>
          <h1>
            Seu tempo,
            <br />
            em boas mãos.
          </h1>
          <p>
            Comprovantes organizados. Datas combinadas.
            <br className="desktop-break" /> E a tranquilidade de saber quantos dias você tem.
          </p>
          <div className="landing-points">
            <span>
              <FolderLock /> Documentos privados
            </span>
            <span>
              <CalendarDays /> Histórico de folgas
            </span>
            <span>
              <Leaf /> Mais clareza, menos papel
            </span>
          </div>
          <div className="landing-footnote">
            <span className="small-emblem">
              <ClipboardCheck />
            </span>
            <p>
              Um cuidado com quem
              <br />
              <strong>faz parte da escola.</strong>
            </p>
          </div>
        </section>
        <section className="login-card" aria-labelledby="login-title">
          <div className="login-top">
            <span className="label">BEM-VINDO AO PORTAL</span>
            <h2 id="login-title">Vamos começar?</h2>
            <p>Escolha seu acesso para continuar.</p>
          </div>
          <div className="role-switch" aria-label="Tipo de acesso">
            <button aria-pressed={role === 'staff'} onClick={() => setRole('staff')}>
              <Users size={17} /> Sou servidor
            </button>
            <button aria-pressed={role === 'director'} onClick={() => setRole('director')}>
              <ShieldCheck size={17} /> Sou da direção
            </button>
          </div>
          <div className="role-explanation">
            <h3>
              {role === 'staff' ? 'Seus dias, em um só lugar.' : 'Uma visão de toda a equipe.'}
            </h3>
            <p>
              {role === 'staff'
                ? 'Envie seus comprovantes e acompanhe o saldo e as datas das suas folgas.'
                : 'Confira comprovantes, organize os créditos e acompanhe as folgas dos servidores.'}
            </p>
          </div>
          <button className="google-button" onClick={login} disabled={!supabase}>
            <GoogleIcon /> Continuar com Google <ArrowRight size={17} />
          </button>
          {!supabase && (
            <p className="setup-note">
              O acesso oficial será liberado após a configuração da escola.
            </p>
          )}
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <div className="login-security">
            <ShieldCheck size={16} />
            <p>
              Use a conta Google autorizada pela direção.
              <br />
              Cada servidor acessa somente seus próprios dados.
            </p>
          </div>
          {demoEnabled && (
            <div className="demo-entry">
              <span>Prévia com dados fictícios</span>
              <button onClick={() => demo(role)}>
                Explorar como {role === 'staff' ? 'servidor' : 'direção'} <ArrowUpRight size={14} />
              </button>
            </div>
          )}
        </section>
      </main>
      <footer className="landing-footer">
        <span>
          Portal Saldo Eleitoral <span className="dot">·</span> Organização que dá tranquilidade.
        </span>
        <button onClick={() => setPrivacy(true)}>
          Privacidade e uso de dados <ArrowUpRight size={13} />
        </button>
      </footer>
      {privacy && (
        <Modal title="Privacidade e uso de dados" close={() => setPrivacy(false)}>
          <div className="prose">
            <p>
              O portal reúne dados funcionais e comprovantes de serviço eleitoral para a gestão de
              folgas da escola.
            </p>
            <p>
              O servidor consulta seus próprios registros. A direção acessa informações conforme
              suas atribuições. Os documentos serão mantidos em armazenamento privado.
            </p>
            <p>
              Antes da abertura oficial, a escola identificará o responsável pelo tratamento,
              contato, base legal e política de guarda. A demonstração utiliza dados fictícios e
              mantém alterações apenas nesta sessão.
            </p>
            <p>Não anexe documentos pessoais na demonstração.</p>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Portal({ repo, exit }: { repo: Repository; exit: () => void }) {
  const [data, setData] = useState<PortalData | null>(null);
  const [page, setPage] = useState<Page>('overview');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const [bookingStaff, setBookingStaff] = useState<string | null>(null);
  const [review, setReview] = useState<Submission | null>(null);
  const [person, setPerson] = useState<Staff | null>(null);
  const [evidence, setEvidence] = useState(false);
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [menu, setMenu] = useState(false);
  const refresh = async () => {
    setError('');
    try {
      setData(await repo.load());
    } catch {
      setError(
        'Não foi possível carregar o portal. O serviço pode estar temporariamente indisponível. Tente novamente ou procure a direção.',
      );
    }
  };
  useEffect(() => {
    let live = true;
    repo
      .load()
      .then((value) => {
        if (live) setData(value);
      })
      .catch(() => {
        if (live)
          setError(
            'Não foi possível abrir seu acesso. Confira a autorização com a direção; o serviço também pode estar indisponível.',
          );
      });
    return () => {
      live = false;
    };
  }, [repo]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 6000);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    heading.current?.focus();
    window.scrollTo({ top: 0 });
  }, [page]);
  const action = async (run: () => Promise<void>, message: string) => {
    setBusy(true);
    try {
      await run();
      setData(await repo.load());
      setToast(message);
    } finally {
      setBusy(false);
    }
  };
  const safeAction = async (run: () => Promise<void>, message: string) => {
    try {
      await action(run, message);
    } catch (e) {
      setToast(errorMessage(e));
    }
  };
  if (!data)
    return (
      <main className="loading-page">
        <Brand />
        {error ? (
          <>
            <p role="alert">{error}</p>
            <Button onClick={refresh} icon={RefreshCw}>
              Tentar novamente
            </Button>
            <button className="text-button" onClick={exit}>
              Voltar ao início
            </button>
          </>
        ) : (
          <>
            <LoaderCircle className="spin" />
            <p>Organizando suas informações…</p>
          </>
        )}
      </main>
    );
  const director = data.user.role === 'director';
  const current = pages.find((p) => p.id === page);
  const pending = data.submissions.filter((s) => s.status === 'pending').length;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Ir para o conteúdo
      </a>
      <aside className="sidebar">
        <Brand />
        <div className="workspace-label">
          <span className="online-dot" />{' '}
          {repo.mode === 'demo' ? 'Espaço de demonstração' : 'Espaço da escola'}
        </div>
        <nav aria-label="Navegação principal">
          {pages
            .filter((p) => director || !p.director)
            .map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                className={page === id ? 'nav-link active' : 'nav-link'}
                aria-label={id === 'overview' && !director ? 'Meu saldo' : label}
                onClick={() => setPage(id)}
                aria-current={page === id ? 'page' : undefined}
              >
                <Icon size={19} strokeWidth={1.65} />
                <span>{id === 'overview' && !director ? 'Meu saldo' : label}</span>
                {id === 'documents' && pending > 0 && <span className="nav-count">{pending}</span>}
              </button>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Leaf size={23} strokeWidth={1.4} />
            <p>
              Organizar hoje.
              <br />
              <strong>Ter tranquilidade amanhã.</strong>
            </p>
          </div>
          <button
            className={`nav-link ${page === 'help' ? 'active' : ''}`}
            onClick={() => setPage('help')}
          >
            <HelpCircle size={19} /> Ajuda e orientações
          </button>
          <button className="nav-link" onClick={exit}>
            <LogOut size={18} /> Sair do portal
          </button>
        </div>
      </aside>
      <div className="app-body">
        <header className="topbar">
          <div className="breadcrumb">
            Espaço da escola <ChevronRight size={13} />
            <strong>{page === 'help' ? 'Ajuda' : current?.label}</strong>
          </div>
          <div className="topbar-right">
            <button
              className="icon-button mobile-more"
              aria-label="Mais opções"
              onClick={() => setMenu(true)}
            >
              <Menu size={21} />
            </button>
            <span className="role-tag">{director ? 'Direção' : 'Servidor'}</span>
            <button
              className="icon-button notifications"
              aria-label="Ver pendências"
              onClick={() => setPage('documents')}
            >
              <Bell size={19} />
              {pending > 0 && <span />}
            </button>
            <div className="user-avatar" title={data.user.name}>
              {initials(data.user.name)}
            </div>
          </div>
        </header>
        {repo.mode === 'demo' && (
          <div className="demo-banner">
            <span>
              <span className="demo-dot" /> Demonstração · dados fictícios, alterações temporárias
            </span>
            <button onClick={exit}>
              Voltar ao acesso <ArrowUpRight size={13} />
            </button>
          </div>
        )}
        <main id="main-content" className="page-content">
          <div className="page-header">
            <div>
              <div className="eyebrow">
                {director ? 'PAINEL DA DIREÇÃO' : 'ÁREA DO SERVIDOR'}{' '}
                <span className="eyebrow-separator">/</span> ELEIÇÕES 2026
              </div>
              <h1 ref={heading} tabIndex={-1}>
                {page === 'overview'
                  ? director
                    ? 'Tudo em um só lugar.'
                    : `Olá, ${data.user.name.split(' ')[0]}.`
                  : page === 'help'
                    ? 'Estamos por aqui.'
                    : current?.label}
              </h1>
              <p>
                {page === 'overview'
                  ? director
                    ? 'Acompanhe os créditos e cuide das folgas da sua equipe.'
                    : 'Acompanhe seus créditos, comprovantes e dias de descanso.'
                  : page === 'staff'
                    ? 'Cada pessoa, seus comprovantes e seu saldo.'
                    : page === 'documents'
                      ? 'Documentos organizados para uma conferência tranquila.'
                      : page === 'calendar'
                        ? 'Datas combinadas, equipe organizada.'
                        : page === 'backup'
                          ? 'Tenha uma cópia dos registros sempre por perto.'
                          : page === 'access'
                            ? 'Defina quem pode entrar no espaço da escola.'
                            : 'Informações para usar o portal com tranquilidade.'}
              </p>
            </div>
            <div className="header-action">
              {director && (page === 'overview' || page === 'calendar') ? (
                <Button icon={Plus} onClick={() => setBookingStaff('')}>
                  Registrar folga
                </Button>
              ) : !director && (page === 'overview' || page === 'documents') ? (
                <Button icon={Plus} onClick={() => setEvidence(true)}>
                  Enviar comprovante
                </Button>
              ) : (
                <span className="date-label">
                  <CalendarDays size={16} />
                  {formatDate(today(), { day: 'numeric', month: 'long', year: 'numeric' })}
                </span>
              )}
            </div>
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {page === 'overview' && (
            <Overview
              data={data}
              director={director}
              navigate={setPage}
              openPerson={setPerson}
              review={setReview}
            />
          )}
          {page === 'staff' && director && (
            <StaffPage data={data} openPerson={setPerson} book={setBookingStaff} />
          )}
          {page === 'documents' && (
            <DocumentsPage data={data} repo={repo} review={setReview} notify={setToast} />
          )}
          {page === 'calendar' && (
            <CalendarPage
              data={data}
              director={director}
              busy={busy}
              edit={(b) => {
                setEditingBooking(b);
                setBookingStaff(b.staffId);
              }}
              change={(b, status) =>
                safeAction(
                  () => repo.changeBooking(b.id, status),
                  status === 'used'
                    ? 'Uso confirmado. Saldo atualizado.'
                    : 'Agendamento cancelado. Reserva liberada.',
                )
              }
            />
          )}
          {page === 'backup' && director && (
            <BackupPage data={data} repo={repo} notify={setToast} />
          )}
          {page === 'access' && director && (
            <AccessPage data={data} repo={repo} action={action} notify={setToast} />
          )}
          {page === 'help' && <HelpPage demo={repo.mode === 'demo'} />}
          <footer className="app-footer">
            <span>
              <ShieldCheck size={14} /> {data.schoolName}
            </span>
            <span>
              Portal Saldo Eleitoral <span className="dot">·</span> Cuidado em cada registro.
            </span>
          </footer>
        </main>
      </div>
      <nav className="mobile-nav" aria-label="Navegação no celular">
        {pages
          .filter((p) =>
            (director
              ? ['overview', 'staff', 'documents', 'calendar', 'backup']
              : ['overview', 'documents', 'calendar']
            ).includes(p.id),
          )
          .map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={page === id ? 'active' : ''}
              onClick={() => setPage(id)}
              aria-current={page === id ? 'page' : undefined}
            >
              <Icon size={20} />
              <span>
                {id === 'overview'
                  ? 'Início'
                  : id === 'backup'
                    ? 'Backup'
                    : id === 'documents'
                      ? 'Documentos'
                      : id === 'calendar'
                        ? 'Folgas'
                        : label}
              </span>
            </button>
          ))}
      </nav>
      {toast && (
        <div className="toast" role="status">
          <AlertCircle size={18} />
          <span>{toast}</span>
          <button aria-label="Fechar aviso" onClick={() => setToast('')}>
            <X size={16} />
          </button>
        </div>
      )}
      {bookingStaff !== null && (
        <BookingModal
          data={data}
          initial={bookingStaff}
          existing={editingBooking}
          close={() => {
            setBookingStaff(null);
            setEditingBooking(null);
          }}
          save={async (input) => {
            await action(
              () => (editingBooking ? repo.reschedule(input) : repo.book(input)),
              'Agendamento salvo. Reserva atualizada.',
            );
            setBookingStaff(null);
            setEditingBooking(null);
          }}
        />
      )}
      {review && (
        <ReviewModal
          item={review}
          data={data}
          repo={repo}
          close={() => setReview(null)}
          save={async (days, note, approved) => {
            await action(
              () => repo.review(review.id, days, note, approved),
              approved
                ? 'Crédito aprovado e registrado no histórico.'
                : 'Pedido devolvido para correção.',
            );
            setReview(null);
          }}
        />
      )}
      {person && (
        <PersonModal
          person={person}
          data={data}
          adjust={async (id, days, reason) => {
            await action(
              () => repo.adjust(id, person.id, days, reason),
              'Ajuste registrado no histórico.',
            );
          }}
          close={() => setPerson(null)}
          book={() => {
            setBookingStaff(person.id);
            setPerson(null);
          }}
        />
      )}
      {menu && (
        <Modal title="Navegar no portal" close={() => setMenu(false)}>
          <div className="mobile-menu-list">
            {pages
              .filter((p) => director || !p.director)
              .map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => {
                    setPage(id);
                    setMenu(false);
                  }}
                >
                  <Icon size={19} />
                  {label}
                  <ChevronRight size={16} />
                </button>
              ))}
            <button
              onClick={() => {
                setPage('help');
                setMenu(false);
              }}
            >
              <HelpCircle size={19} />
              Ajuda e orientações
              <ChevronRight size={16} />
            </button>
            <button onClick={exit}>
              <LogOut size={19} />
              Sair do portal
            </button>
          </div>
        </Modal>
      )}
      {evidence && (
        <EvidenceModal
          data={data}
          close={() => {
            setEvidence(false);
            void refresh();
          }}
          save={async (input) => {
            await action(() => repo.submit(input), 'Comprovantes enviados para análise.');
            setEvidence(false);
          }}
        />
      )}
    </div>
  );
}

function Overview({
  data,
  director,
  navigate,
  openPerson,
  review,
}: {
  data: PortalData;
  director: boolean;
  navigate: (p: Page) => void;
  openPerson: (s: Staff) => void;
  review: (s: Submission) => void;
}) {
  const totals = balance(data);
  const pending = data.submissions.filter((s) => s.status === 'pending');
  const stats = director
    ? [
        {
          label: 'Servidores cadastrados',
          value: data.staff.length,
          note: 'Pessoas da sua equipe',
          icon: Users,
          tone: 'green',
        },
        {
          label: 'Dias disponíveis',
          value: totals.available,
          note: 'Saldo livre para agendar',
          icon: Leaf,
          tone: 'sand',
        },
        {
          label: 'Aguardando análise',
          value: pending.length,
          note: 'Comprovantes para conferir',
          icon: FileCheck2,
          tone: 'terra',
        },
        {
          label: 'Dias agendados',
          value: totals.reserved,
          note: 'Reservados pela direção',
          icon: CalendarDays,
          tone: 'blue',
        },
      ]
    : [
        {
          label: 'Créditos aprovados',
          value: totals.credits,
          note: 'Seu direito reconhecido',
          icon: FileCheck2,
          tone: 'green',
        },
        {
          label: 'Dias disponíveis',
          value: totals.available,
          note: 'Livres para combinar',
          icon: Leaf,
          tone: 'sand',
        },
        {
          label: 'Dias usufruídos',
          value: totals.used,
          note: 'Descansos já registrados',
          icon: CheckCheck,
          tone: 'terra',
        },
        {
          label: 'Dias agendados',
          value: totals.reserved,
          note: 'Suas próximas folgas',
          icon: CalendarDays,
          tone: 'blue',
        },
      ];
  const upcoming = data.bookings
    .filter((b) => b.status === 'reserved')
    .sort((a, b) => a.dates[0].localeCompare(b.dates[0]));
  return (
    <>
      <div className="stats-grid">
        {stats.map(({ label, value, note, icon: Icon, tone }) => (
          <section className="stat-card" key={label}>
            <div className="stat-top">
              <span>{label}</span>
              <span className={`stat-icon ${tone}`}>
                <Icon size={19} strokeWidth={1.6} />
              </span>
            </div>
            <strong>
              {value}
              <span>{label.includes('Dias') || label.includes('Créditos') ? ' dias' : ''}</span>
            </strong>
            <p>{note}</p>
          </section>
        ))}
      </div>
      <div className="overview-grid">
        <div className="main-column">
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>{director ? 'Próximas folgas' : 'Seus próximos dias de descanso'}</h2>
                <p>Datas já combinadas com a direção.</p>
              </div>
              <button className="text-button" onClick={() => navigate('calendar')}>
                Ver agenda <ArrowRight size={15} />
              </button>
            </div>
            {upcoming.length ? (
              <div className="upcoming-list">
                {upcoming.slice(0, 4).map((b) => {
                  const person = data.staff.find((s) => s.id === b.staffId)!;
                  return (
                    <div className="upcoming-row" key={b.id}>
                      <div className="date-tile">
                        <strong>{b.dates[0].slice(8)}</strong>
                        <span>{formatDate(b.dates[0], { month: 'short' }).replace('.', '')}</span>
                      </div>
                      <button className="person-link" onClick={() => openPerson(person)}>
                        <strong>{person?.name ?? 'Servidor'}</strong>
                        <span>{b.dates.map((d) => formatDate(d)).join(' · ')}</span>
                      </button>
                      <span className="days-pill">
                        {b.dates.length} {b.dates.length === 1 ? 'dia' : 'dias'}
                      </span>
                      <Badge status="reserved" />
                    </div>
                  );
                })}
              </div>
            ) : (
              <Empty
                title="Nenhuma folga agendada"
                text="Os próximos dias combinados aparecerão aqui."
              />
            )}
          </section>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>{director ? 'Um olhar para a equipe' : 'Seu extrato de dias'}</h2>
                <p>
                  {director
                    ? 'Saldos atualizados a cada movimentação.'
                    : 'Tudo que foi aprovado, reservado e usufruído.'}
                </p>
              </div>
              {director && (
                <button className="text-button" onClick={() => navigate('staff')}>
                  Ver todos <ArrowRight size={15} />
                </button>
              )}
            </div>
            {director ? (
              <StaffTable data={data} staff={data.staff.slice(0, 4)} openPerson={openPerson} />
            ) : (
              <div className="ledger-list">
                {data.credits.map((c) => (
                  <div className="ledger-row" key={c.id}>
                    <span className="activity-icon">
                      <Plus size={17} />
                    </span>
                    <div>
                      <strong>{c.reason}</strong>
                      <small>{formatDate(c.createdAt)} · Aprovado pela direção</small>
                    </div>
                    <strong className="positive">
                      {c.days > 0 ? '+' : ''}
                      {c.days} dias
                    </strong>
                  </div>
                ))}
                {data.bookings
                  .filter((b) => b.status === 'used')
                  .map((b) => (
                    <div className="ledger-row" key={b.id}>
                      <span className="activity-icon terra">
                        <Check size={17} />
                      </span>
                      <div>
                        <strong>Folga usufruída</strong>
                        <small>{b.dates.map((d) => formatDate(d)).join(' · ')}</small>
                      </div>
                      <strong>−{b.dates.length} dias</strong>
                    </div>
                  ))}
                {!data.credits.length && (
                  <Empty
                    title="Seu histórico começa aqui"
                    text="Os créditos aparecerão após a conferência dos comprovantes."
                  />
                )}
              </div>
            )}
          </section>
        </div>
        <aside className="right-column">
          <section className="panel attention-panel">
            <div className="panel-heading">
              <h2>{pending.length ? 'Pedem sua atenção' : 'Tudo organizado'}</h2>
              <span className="attention-dot" />
            </div>
            {pending.length ? (
              <>
                <p className="attention-copy">
                  {director
                    ? 'Novos comprovantes chegaram. Uma conferência e tudo segue em dia.'
                    : 'Seus comprovantes estão aguardando a conferência da direção.'}
                </p>
                {pending.slice(0, 3).map((s) => (
                  <button
                    key={s.id}
                    className="pending-item"
                    onClick={() => (director ? review(s) : navigate('documents'))}
                  >
                    <span className="file-icon">
                      <FileText size={18} />
                    </span>
                    <span>
                      <strong>{data.staff.find((p) => p.id === s.staffId)?.name}</strong>
                      <small>{s.activity}</small>
                    </span>
                    <ChevronRight size={15} />
                  </button>
                ))}
                <button className="attention-link" onClick={() => navigate('documents')}>
                  {director ? 'Ir para comprovantes' : 'Acompanhar análise'}
                  <ArrowRight size={15} />
                </button>
              </>
            ) : (
              <Empty title="Sem pendências" text="As novidades aparecerão por aqui." />
            )}
          </section>
          <section className="calm-card">
            <span className="botanical">
              <Leaf size={32} strokeWidth={1.1} />
            </span>
            <span className="label">CLAREZA PARA TODOS</span>
            <h2>
              Menos dúvidas.
              <br />
              Mais tranquilidade.
            </h2>
            <p>
              {director
                ? 'Cada servidor acompanha o próprio saldo. Você cuida da equipe com tudo organizado.'
                : 'Seu saldo é atualizado após a conferência e o registro das folgas pela direção.'}
            </p>
            <button className="text-button" onClick={() => navigate('help')}>
              Como funciona <ArrowUpRight size={15} />
            </button>
          </section>
          {director && (
            <section className="activity-panel">
              <h3>Últimos registros</h3>
              {data.audit.slice(0, 3).map((a) => (
                <div className="activity-item" key={a.id}>
                  <span />
                  <div>
                    <strong>{a.action}</strong>
                    <p>{a.detail}</p>
                    <small>
                      {formatDate(a.createdAt)} · {a.actor}
                    </small>
                  </div>
                </div>
              ))}
            </section>
          )}
        </aside>
      </div>
      <Notice>
        Os dias informados pelo servidor passam por conferência. O saldo disponível considera
        créditos aprovados, usos e reservas.
      </Notice>
    </>
  );
}
function StaffTable({
  data,
  staff,
  openPerson,
}: {
  data: PortalData;
  staff: Staff[];
  openPerson: (s: Staff) => void;
}) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Servidor</th>
            <th>Disponíveis</th>
            <th>Agendados</th>
            <th>
              <span className="sr-only">Detalhes</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {staff.map((s, i) => {
            const b = balance(data, s.id);
            return (
              <tr key={s.id}>
                <td>
                  <button className="table-person" onClick={() => openPerson(s)}>
                    <span className={`avatar avatar-${i % 4}`}>{initials(s.name)}</span>
                    <span>
                      <strong>{s.name}</strong>
                      <small>{s.registration || 'Matrícula não informada'}</small>
                    </span>
                  </button>
                </td>
                <td>
                  <strong className="table-number">{b.available}</strong>
                  <span className="muted"> dias</span>
                </td>
                <td>
                  {b.reserved ? (
                    <span className="reservation-pill">
                      {b.reserved} {b.reserved === 1 ? 'dia' : 'dias'}
                    </span>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td>
                  <button
                    className="icon-button"
                    onClick={() => openPerson(s)}
                    aria-label={`Ver ficha de ${s.name}`}
                  >
                    <ArrowUpRight size={17} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
function StaffPage({
  data,
  openPerson,
  book,
}: {
  data: PortalData;
  openPerson: (s: Staff) => void;
  book: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const filtered = data.staff.filter(
    (s) =>
      `${s.name} ${s.registration}`
        .toLocaleLowerCase('pt-BR')
        .includes(query.toLocaleLowerCase('pt-BR')) &&
      (!onlyAvailable || balance(data, s.id).available > 0),
  );
  return (
    <section className="panel">
      <div className="list-toolbar">
        <label className="search-field">
          <Search size={18} />
          <input
            aria-label="Buscar servidor por nome ou matrícula"
            placeholder="Buscar por nome ou matrícula"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <button
          className={`filter-button ${onlyAvailable ? 'selected' : ''}`}
          onClick={() => setOnlyAvailable(!onlyAvailable)}
          aria-pressed={onlyAvailable}
        >
          <Settings2 size={16} /> Com saldo disponível
        </button>
        <Button icon={Plus} onClick={() => book('')}>
          Registrar folga
        </Button>
      </div>
      <div className="list-count">
        {filtered.length} {filtered.length === 1 ? 'servidor encontrado' : 'servidores encontrados'}
      </div>
      {filtered.length ? (
        <StaffTable data={data} staff={filtered} openPerson={openPerson} />
      ) : (
        <Empty title="Nenhum servidor encontrado" text="Confira o nome ou remova os filtros." />
      )}
    </section>
  );
}
function DocumentsPage({
  data,
  repo,
  review,
  notify,
}: {
  data: PortalData;
  repo: Repository;
  review: (s: Submission) => void;
  notify: (s: string) => void;
}) {
  const [filter, setFilter] = useState('all');
  const filtered = data.submissions.filter((s) => filter === 'all' || s.status === filter);
  return (
    <>
      <div className="tabs" aria-label="Filtrar comprovantes">
        {[
          ['all', 'Todos'],
          ['pending', 'Aguardando análise'],
          ['approved', 'Aprovados'],
          ['changes_requested', 'Correções'],
        ].map(([value, label]) => (
          <button
            key={value}
            aria-pressed={filter === value}
            className={filter === value ? 'active' : ''}
            onClick={() => setFilter(value)}
          >
            {label}
            <span>
              {data.submissions.filter((s) => value === 'all' || s.status === value).length}
            </span>
          </button>
        ))}
      </div>
      <div className="document-grid">
        {filtered.map((s) => (
          <section className="panel document-card" key={s.id}>
            <div className="document-card-top">
              <span className="file-icon">
                <FileText size={24} strokeWidth={1.4} />
              </span>
              <Badge status={s.status} />
            </div>
            <h2>{data.staff.find((p) => p.id === s.staffId)?.name}</h2>
            <p>{s.activity}</p>
            <div className="document-details">
              <span>{s.declaredDays} dias declarados</span>
              <span>{formatDate(s.createdAt)}</span>
            </div>
            {s.note && <p className="review-note">{s.note}</p>}
            <DocumentLinks data={data} submissionId={s.id} repo={repo} notify={notify} />
            {data.user.role === 'director' && s.status === 'pending' && (
              <Button secondary onClick={() => review(s)} icon={ArrowRight}>
                Analisar comprovantes
              </Button>
            )}
          </section>
        ))}
      </div>
      {!filtered.length && (
        <section className="panel">
          <Empty
            title="Nenhum comprovante por aqui"
            text="Os documentos enviados aparecerão nesta lista."
          />
        </section>
      )}
      <Notice>
        Comprovante enviado não gera crédito automaticamente. A direção confere os documentos antes
        de aprovar os dias.
      </Notice>
    </>
  );
}
function DocumentLinks({
  data,
  submissionId,
  repo,
  notify,
}: {
  data: PortalData;
  submissionId: string;
  repo: Repository;
  notify: (s: string) => void;
}) {
  const [downloading, setDownloading] = useState(false);
  const docs = data.documents.filter((d) => d.submissionId === submissionId);
  return (
    <div className="document-links">
      {docs.map((doc) => (
        <button
          key={doc.id}
          className="download-link"
          disabled={downloading}
          onClick={async () => {
            setDownloading(true);
            try {
              saveBlob(await repo.download(doc), doc.name);
            } catch (e) {
              notify(errorMessage(e));
            } finally {
              setDownloading(false);
            }
          }}
        >
          <FileText size={15} />
          <span>{doc.name}</span>
          <small>{formatBytes(doc.size)}</small>
          <ArrowDownToLine size={15} />
        </button>
      ))}
      {!docs.length && repo.mode === 'demo' && (
        <span className="muted small">Exemplo fictício, sem PDF pessoal.</span>
      )}
    </div>
  );
}
function MiniCalendar({ bookings }: { bookings: Booking[] }) {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const start = (month.getDay() + 6) % 7;
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  return (
    <section className="panel month-panel">
      <div className="month-title">
        <h2>{month.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</h2>
        <div>
          <button
            className="icon-button"
            aria-label="Mês anterior"
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
          >
            <ChevronLeft size={17} />
          </button>
          <button
            className="icon-button"
            aria-label="Próximo mês"
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
          >
            <ChevronRight size={17} />
          </button>
        </div>
      </div>
      <div className="calendar-grid">
        {['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((d, i) => (
          <span className="weekday" key={i}>
            {d}
          </span>
        ))}
        {Array.from({ length: start }, (_, i) => (
          <span key={`blank${i}`} />
        ))}
        {Array.from({ length: count }, (_, i) => {
          const date = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
          const events = bookings.filter((b) => b.status !== 'cancelled' && b.dates.includes(date));
          return (
            <span
              title={`${formatDate(date)} · ${events.length} registro(s)`}
              key={date}
              className={`calendar-day ${date === today() ? 'today' : ''} ${events.length ? 'has-event' : ''}`}
            >
              {i + 1}
              {events.length > 0 && <i />}
            </span>
          );
        })}
      </div>
      <div className="calendar-legend">
        <span /> Dias com folgas registradas
      </div>
    </section>
  );
}
function CalendarPage({
  data,
  director,
  busy,
  change,
  edit,
}: {
  data: PortalData;
  director: boolean;
  busy: boolean;
  edit: (b: Booking) => void;
  change: (b: Booking, s: 'used' | 'cancelled') => void;
}) {
  const [filter, setFilter] = useState('reserved');
  const [confirm, setConfirm] = useState<{ booking: Booking; status: 'used' | 'cancelled' } | null>(
    null,
  );
  const items = data.bookings
    .filter((b) => b.status === filter)
    .sort((a, b) => a.dates[0].localeCompare(b.dates[0]));
  return (
    <>
      <div className="calendar-layout">
        <div>
          <div className="tabs">
            {[
              ['reserved', 'Agendadas'],
              ['used', 'Usufruídas'],
              ['cancelled', 'Canceladas'],
            ].map(([value, label]) => (
              <button
                key={value}
                className={filter === value ? 'active' : ''}
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <section className="panel booking-list">
            {items.map((b) => (
              <article className="booking-card" key={b.id}>
                <div className="booking-title">
                  <span className="avatar">
                    {initials(data.staff.find((s) => s.id === b.staffId)?.name ?? 'Servidor')}
                  </span>
                  <div>
                    <h3>{data.staff.find((s) => s.id === b.staffId)?.name}</h3>
                    <p>
                      {b.dates
                        .map((d) =>
                          formatDate(d, { day: '2-digit', month: 'short', year: 'numeric' }),
                        )
                        .join(' · ')}
                    </p>
                  </div>
                  <Badge status={b.status} />
                </div>
                <p className="booking-reason">{b.reason}</p>
                <div className="booking-bottom">
                  <span>
                    {b.dates.length} {b.dates.length === 1 ? 'dia' : 'dias'}
                  </span>
                  {director && b.status === 'reserved' && (
                    <div>
                      <button className="text-button" onClick={() => edit(b)} disabled={busy}>
                        Editar
                      </button>
                      <button
                        className="text-button danger-text"
                        onClick={() => setConfirm({ booking: b, status: 'cancelled' })}
                        disabled={busy}
                      >
                        Cancelar
                      </button>
                      <Button
                        secondary
                        icon={Check}
                        onClick={() => setConfirm({ booking: b, status: 'used' })}
                        disabled={busy}
                      >
                        Confirmar uso
                      </Button>
                    </div>
                  )}
                </div>
              </article>
            ))}
            {!items.length && (
              <Empty
                title="Nenhuma folga nesta lista"
                text="Os registros aparecerão conforme as datas forem combinadas."
              />
            )}
          </section>
        </div>
        <MiniCalendar bookings={data.bookings} />
      </div>
      {confirm && (
        <Modal
          title={
            confirm.status === 'used' ? 'Confirmar dias usufruídos?' : 'Cancelar este agendamento?'
          }
          close={() => setConfirm(null)}
        >
          <div className="prose">
            <p>
              {confirm.status === 'used'
                ? 'A reserva será convertida em consumo. Confirme somente após verificar que as datas foram usufruídas.'
                : 'Os dias reservados voltarão a ficar disponíveis. O cancelamento ficará no histórico.'}
            </p>
            <p>
              <strong>{confirm.booking.dates.map((d) => formatDate(d)).join(' · ')}</strong>
            </p>
          </div>
          <div className="modal-actions">
            <Button secondary onClick={() => setConfirm(null)}>
              Voltar
            </Button>
            <Button
              onClick={() => {
                change(confirm.booking, confirm.status);
                setConfirm(null);
              }}
            >
              Confirmar
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}

function BookingModal({
  data,
  initial,
  save,
  close,
  existing,
}: {
  data: PortalData;
  initial: string;
  existing: Booking | null;
  save: (input: { id: string; staffId: string; dates: string[]; reason: string }) => Promise<void>;
  close: () => void;
}) {
  const [staffId, setStaffId] = useState(initial);
  const [date, setDate] = useState('');
  const [dates, setDates] = useState<string[]>(existing?.dates ?? []);
  const [reason, setReason] = useState(existing?.reason ?? 'Folga combinada com a direção');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const operation = useRef(existing?.id ?? crypto.randomUUID());
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const input = { id: operation.current, staffId, dates: [...dates].sort(), reason };
      validateBooking(
        existing ? { ...data, bookings: data.bookings.filter((b) => b.id !== existing.id) } : data,
        input,
      );
      await save(input);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={existing ? 'Editar agendamento' : 'Registrar folga'} close={close} busy={busy}>
      <form onSubmit={submit}>
        <label className="field">
          Servidor
          <select
            aria-label="Servidor"
            required
            disabled={!!existing}
            value={staffId}
            onChange={(e) => setStaffId(e.target.value)}
          >
            <option value="">Selecione uma pessoa</option>
            {data.staff
              .filter((s) => s.active)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </label>
        {staffId && (
          <div className="balance-note">
            <Leaf size={17} /> {balance(data, staffId).available} dias disponíveis para agendar
          </div>
        )}
        <label className="field">
          Data da folga
          <div className="date-picker-row">
            <input
              aria-label="Data da folga"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <Button
              type="button"
              secondary
              onClick={() => {
                if (date && !dates.includes(date)) setDates([...dates, date]);
                setDate('');
              }}
              disabled={!date}
              icon={Plus}
            >
              Adicionar
            </Button>
          </div>
        </label>
        <p className="field-hint">
          Adicione cada data que será debitada. A contagem considera dias inteiros.
        </p>
        <div className="date-chips">
          {dates.map((d) => (
            <button
              type="button"
              key={d}
              onClick={() => setDates(dates.filter((v) => v !== d))}
              aria-label={`Remover ${formatDate(d)}`}
            >
              {formatDate(d)}
              <X size={13} />
            </button>
          ))}
        </div>
        <label className="field">
          Observação
          <textarea
            required
            minLength={3}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <Notice>
          O agendamento reserva os dias. A confirmação de uso será feita depois, sem desconto
          duplicado.
        </Notice>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <Button secondary type="button" onClick={close} disabled={busy}>
            Voltar
          </Button>
          <Button type="submit" disabled={busy || !dates.length} icon={busy ? LoaderCircle : Check}>
            {busy
              ? 'Registrando…'
              : `Reservar ${dates.length || ''} ${dates.length === 1 ? 'dia' : 'dias'}`}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function ReviewModal({
  item,
  data,
  repo,
  close,
  save,
}: {
  item: Submission;
  data: PortalData;
  repo: Repository;
  close: () => void;
  save: (days: number, note: string, approved: boolean) => Promise<void>;
}) {
  const [days, setDays] = useState(item.declaredDays);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(false);
  const run = async (approved: boolean) => {
    setError('');
    setBusy(true);
    try {
      if (note.trim().length < 3) throw new Error('Registre o motivo da decisão.');
      if (approved && !checked) throw new Error('Confira os documentos antes de aprovar.');
      await save(days, note, approved);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Analisar comprovantes" close={close} busy={busy}>
      <div className="review-person">
        <span className="avatar">
          {initials(data.staff.find((s) => s.id === item.staffId)?.name ?? 'Servidor')}
        </span>
        <div>
          <strong>{data.staff.find((s) => s.id === item.staffId)?.name}</strong>
          <p>
            {item.activity} · {item.declaredDays} dias declarados
          </p>
        </div>
      </div>
      <DocumentLinks data={data} submissionId={item.id} repo={repo} notify={setError} />
      <label className="field">
        Dias comprovados
        <input
          type="number"
          min={1}
          max={366}
          step={1}
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
        />
      </label>
      <label className="field">
        Justificativa da decisão
        <textarea
          minLength={3}
          maxLength={500}
          placeholder="Registre a conferência ou explique o que precisa ser corrigido."
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <label className="checkbox-field">
        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
        Conferi os documentos e a quantidade de dias.
      </label>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <Button secondary onClick={() => run(false)} disabled={busy}>
          Solicitar correção
        </Button>
        <Button icon={Check} onClick={() => run(true)} disabled={busy || !checked}>
          Aprovar crédito
        </Button>
      </div>
    </Modal>
  );
}
function PersonModal({
  person,
  data,
  close,
  book,
  adjust,
}: {
  person: Staff;
  data: PortalData;
  close: () => void;
  book: () => void;
  adjust: (id: string, days: number, reason: string) => Promise<void>;
}) {
  const b = balance(data, person.id);
  const [editing, setEditing] = useState(false);
  const [days, setDays] = useState(0);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const operationId = useRef(crypto.randomUUID());
  const form = (
    <form
      className="credit-adjustment"
      onSubmit={async (e) => {
        e.preventDefault();
        setError('');
        setBusy(true);
        try {
          if (!Number.isInteger(days) || !days || Math.abs(days) > 366 || reason.trim().length < 3)
            throw new Error('Informe uma quantidade inteira diferente de zero e a justificativa.');
          await adjust(operationId.current, days, reason);
          operationId.current = crypto.randomUUID();
          setEditing(false);
          setDays(0);
          setReason('');
        } catch (e) {
          setError(errorMessage(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="field">
        Ajuste de dias
        <input
          type="number"
          min={-366}
          max={366}
          step={1}
          required
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
        />
      </label>
      <p className="field-hint">
        Use valor positivo para acrescentar e negativo para corrigir. O histórico será preservado.
      </p>
      <label className="field">
        Justificativa
        <textarea
          required
          minLength={3}
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <Button secondary type="button" disabled={busy} onClick={() => setEditing(false)}>
          Voltar
        </Button>
        <Button type="submit" disabled={busy}>
          Registrar ajuste
        </Button>
      </div>
    </form>
  );
  return (
    <Modal title="Ficha do servidor" close={close}>
      <div className="profile-summary">
        <span className="avatar large">{initials(person.name)}</span>
        <h3>{person.name}</h3>
        <p>{person.email}</p>
        <small>{person.registration || 'Matrícula não informada'}</small>
      </div>
      <div className="profile-balances">
        {[
          ['Disponíveis', b.available],
          ['Usufruídos', b.used],
          ['Reservados', b.reserved],
        ].map(([label, value]) => (
          <div key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <h3 className="section-small">Histórico de créditos</h3>
      {data.credits
        .filter((c) => c.staffId === person.id)
        .map((c) => (
          <div className="ledger-row" key={c.id}>
            <div>
              <strong>{c.reason}</strong>
              <small>
                {formatDate(c.createdAt)} · {c.actor}
              </small>
            </div>
            <strong className="positive">
              {c.days > 0 ? '+' : ''}
              {c.days}
            </strong>
          </div>
        ))}
      {data.user.role === 'director' &&
        (editing ? (
          form
        ) : (
          <div className="modal-actions">
            <Button secondary onClick={() => setEditing(true)}>
              Ajustar créditos
            </Button>
            <Button icon={Plus} onClick={book}>
              Registrar folga
            </Button>
          </div>
        ))}
    </Modal>
  );
}
function EvidenceModal({
  data,
  close,
  save,
}: {
  data: PortalData;
  close: () => void;
  save: (input: {
    id: string;
    name: string;
    registration: string;
    activity: string;
    days: number;
    files: File[];
  }) => Promise<void>;
}) {
  const person = data.staff.find((s) => s.id === data.user.staffId);
  const draft = data.submissions.find(
    (s) => s.staffId === data.user.staffId && s.status === 'draft',
  );
  const [name, setName] = useState(person?.name ?? data.user.name);
  const [registration, setRegistration] = useState(person?.registration ?? '');
  const [activity, setActivity] = useState(draft?.activity ?? 'Treinamento e 1º turno · 2026');
  const [days, setDays] = useState(draft?.declaredDays ?? 2);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const id = useRef(draft?.id ?? crypto.randomUUID());
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const fields = evidenceSchema.parse({ name, registration, activity, days });
      await validateFiles(files);
      if (!consent) throw new Error('Confirme que os dados correspondem aos documentos.');
      await save({ id: id.current, ...fields, files });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Enviar comprovantes" close={close} busy={busy}>
      <form onSubmit={submit}>
        {draft && (
          <Notice>
            Há um envio interrompido. Reanexe os mesmos PDFs para retomar. Se precisar trocar os
            arquivos ou os dados originais, procure a direção.
          </Notice>
        )}
        <div className="form-columns">
          <label className="field">
            Nome completo
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
              autoComplete="name"
            />
          </label>
          <label className="field">
            Matrícula, se aplicável
            <input
              value={registration}
              onChange={(e) => setRegistration(e.target.value)}
              maxLength={60}
            />
          </label>
        </div>
        <label className="field">
          Atividade comprovada
          <select value={activity} onChange={(e) => setActivity(e.target.value)}>
            <option>Treinamento e 1º turno · 2026</option>
            <option>Treinamento · 2026</option>
            <option>1º turno · 2026</option>
            <option>2º turno · 2026</option>
            <option>Outra atividade eleitoral</option>
          </select>
        </label>
        <label className="field">
          Dias de folga declarados
          <input
            type="number"
            min={1}
            max={366}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            required
          />
        </label>
        <label className="upload-zone">
          <UploadCloud size={28} strokeWidth={1.4} />
          <strong>Escolher comprovantes PDF</strong>
          <span>De 1 a 3 arquivos · até 10 MB no total</span>
          <input
            type="file"
            accept="application/pdf,.pdf"
            multiple
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          />
        </label>
        {files.map((f, i) => (
          <div className="selected-file" key={`${f.name}-${i}`}>
            <FileText size={16} />
            <span>{f.name}</span>
            <small>{formatBytes(f.size)}</small>
            <button
              type="button"
              aria-label={`Remover ${f.name}`}
              className="icon-button"
              onClick={() => setFiles(files.filter((_, j) => j !== i))}
            >
              <X size={15} />
            </button>
          </div>
        ))}
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            required
          />
          Conferi os dados e anexei os documentos correspondentes.
        </label>
        <Notice>
          Os dias passam pela análise da direção. Preserve o PDF original, especialmente se tiver
          assinatura digital.
        </Notice>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <Button secondary type="button" disabled={busy} onClick={close}>
            Voltar
          </Button>
          <Button type="submit" disabled={busy} icon={busy ? LoaderCircle : ArrowRight}>
            {busy ? 'Enviando e conferindo…' : 'Enviar para análise'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function AccessPage({
  data,
  repo,
  action,
  notify,
}: {
  data: PortalData;
  repo: Repository;
  action: (run: () => Promise<void>, message: string) => Promise<void>;
  notify: (s: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await action(
        () => repo.addAccess({ name, email, role: 'staff' }),
        'E-mail autorizado. O servidor já pode entrar com Google.',
      );
      setOpen(false);
      setName('');
      setEmail('');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Acessos autorizados</h2>
            <p>Autorize o e-mail antes do primeiro acesso.</p>
          </div>
          <Button icon={Plus} onClick={() => setOpen(true)}>
            Autorizar servidor
          </Button>
        </div>
        <div className="access-list">
          {data.access.map((a) => (
            <div className="access-row" key={a.id}>
              <span className="avatar">{initials(a.name)}</span>
              <div>
                <strong>{a.name}</strong>
                <span>{a.email}</span>
              </div>
              <span className={`access-status ${a.active ? '' : 'inactive'}`}>
                {a.active ? 'Autorizado' : 'Desativado'}
              </span>
              <button
                className="text-button"
                disabled={a.role === 'director'}
                onClick={() => setConfirm(a.id)}
              >
                {a.active ? 'Desativar' : 'Reativar'}
              </button>
            </div>
          ))}
        </div>
      </section>
      <Notice>
        Autorizar um e-mail não envia uma mensagem nem exige que a pessoa já tenha conta no portal.
      </Notice>
      {open && (
        <Modal title="Autorizar servidor" close={() => setOpen(false)} busy={busy}>
          <form onSubmit={submit}>
            <label className="field">
              Nome do servidor
              <input
                required
                minLength={3}
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="field">
              E-mail da conta Google
              <input
                required
                type="email"
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="off"
              />
            </label>
            <p className="field-hint">
              Confirme com a pessoa qual conta será utilizada. Endereços institucionais Google
              também são aceitos.
            </p>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <Button secondary type="button" onClick={() => setOpen(false)} disabled={busy}>
                Voltar
              </Button>
              <Button disabled={busy} type="submit" icon={Check}>
                Autorizar acesso
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {confirm && (
        <Modal title="Alterar autorização?" close={() => setConfirm(null)}>
          <div className="prose">
            <p>
              {data.access.find((a) => a.id === confirm)?.active
                ? 'O servidor perderá o acesso. Seus documentos e histórico serão preservados.'
                : 'O servidor poderá entrar novamente com a conta autorizada.'}
            </p>
            <p>
              <strong>{data.access.find((a) => a.id === confirm)?.email}</strong>
            </p>
          </div>
          <div className="modal-actions">
            <Button secondary onClick={() => setConfirm(null)}>
              Voltar
            </Button>
            <Button
              onClick={async () => {
                const entry = data.access.find((a) => a.id === confirm)!;
                try {
                  await action(
                    () => repo.toggleAccess(entry.id, !entry.active),
                    'Autorização atualizada.',
                  );
                  setConfirm(null);
                } catch (e) {
                  notify(errorMessage(e));
                }
              }}
            >
              Confirmar
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
function BackupPage({
  data,
  repo,
  notify,
}: {
  data: PortalData;
  repo: Repository;
  notify: (s: string) => void;
}) {
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [summary, setSummary] = useState<BackupSummary | null>(null);
  const [mode, setMode] = useState<'export' | 'verify' | null>(null);
  const [error, setError] = useState('');
  const run = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setSummary(null);
    try {
      if (mode === 'export') {
        if (password !== again) throw new Error('As frases de recuperação não conferem.');
        const result = await exportBackup(repo, password, setProgress);
        notify(
          `${result.parts} parte(s) gerada(s). Guarde os arquivos e valide o conjunto; iniciar o download não comprova que foram salvos.`,
        );
        setMode(null);
      } else {
        setProgress('Verificando partes e integridade dos documentos…');
        setSummary(await verifyBackup(files, password));
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
      setProgress('');
      setPassword('');
      setAgain('');
    }
  };
  return (
    <>
      <div className="backup-hero">
        <span className="backup-emblem">
          <FolderLock size={36} strokeWidth={1.3} />
        </span>
        <div>
          <span className="label">UMA CÓPIA PARA FICAR TRANQUILO</span>
          <h2>Seus registros merecem cuidado.</h2>
          <p>Guarde dados e comprovantes juntos. Mantenha uma cópia protegida fora do portal.</p>
        </div>
      </div>
      <div className="backup-grid">
        <section className="panel backup-card">
          <FileText size={25} strokeWidth={1.4} />
          <h2>Relatório de saldos</h2>
          <p>
            Uma planilha CSV com os saldos da equipe para consulta. Não substitui o backup completo.
          </p>
          <Button
            secondary
            icon={ArrowDownToLine}
            onClick={() =>
              saveBlob(
                new Blob([csv(data)], { type: 'text/csv;charset=utf-8' }),
                `saldos-${today()}.csv`,
              )
            }
          >
            Exportar relatório
          </Button>
        </section>
        <section className="panel backup-card">
          <FolderLock size={25} strokeWidth={1.4} />
          <h2>Backup completo</h2>
          <p>
            Dados, histórico e PDFs originais em partes protegidas por uma frase de recuperação.
          </p>
          <div className="backup-count">
            {data.staff.length} servidores · {data.documents.length} documentos ·{' '}
            {formatBytes(data.documents.reduce((n, d) => n + d.size, 0))}
          </div>
          <Button
            icon={ArrowDownToLine}
            onClick={() => {
              setMode('export');
              setError('');
            }}
          >
            Gerar backup protegido
          </Button>
        </section>
        <section className="panel backup-card">
          <ShieldCheck size={25} strokeWidth={1.4} />
          <h2>Verificar uma cópia</h2>
          <p>
            Confira se todas as partes e documentos estão íntegros. A verificação não altera o
            portal.
          </p>
          <Button
            secondary
            icon={CheckCheck}
            onClick={() => {
              setMode('verify');
              setError('');
              setSummary(null);
            }}
          >
            Verificar backup
          </Button>
        </section>
      </div>
      <Notice>
        Guarde uma cópia local e outra em uma pasta privada, por exemplo no Drive da escola. A
        recuperação em produção será assistida pelo responsável técnico.
      </Notice>
      <section className="panel backup-instructions">
        <h2>Uma rotina simples de proteção</h2>
        <ol>
          <li>Gere uma cópia após grandes alterações e ao menos semanalmente durante o uso.</li>
          <li>Guarde todas as partes e mantenha a frase de recuperação em outro lugar seguro.</li>
          <li>Use “Verificar backup” para conferir os arquivos que você salvou.</li>
          <li>
            Para restaurar, procure o responsável técnico: uma cópia antiga pode substituir
            alterações recentes.
          </li>
        </ol>
        <p>
          Entrar com Google não conecta automaticamente seu Drive. O envio da cópia ao Drive é
          manual nesta versão.
        </p>
      </section>
      {mode && (
        <Modal
          title={mode === 'export' ? 'Gerar backup protegido' : 'Verificar backup'}
          busy={busy}
          close={() => {
            setMode(null);
            setPassword('');
            setAgain('');
          }}
        >
          <form onSubmit={run}>
            {mode === 'verify' && (
              <label className="field">
                Todas as partes do backup
                <input
                  type="file"
                  accept=".psebackup"
                  multiple
                  required
                  onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                />
              </label>
            )}
            <label className="field">
              Frase de recuperação
              <input
                type="password"
                autoComplete="off"
                minLength={16}
                maxLength={256}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Pelo menos 16 caracteres"
              />
            </label>
            {mode === 'export' && (
              <>
                <label className="field">
                  Repita a frase
                  <input
                    type="password"
                    autoComplete="off"
                    minLength={16}
                    value={again}
                    onChange={(e) => setAgain(e.target.value)}
                    required
                  />
                </label>
                <p className="field-hint">
                  Sem essa frase, a cópia não poderá ser aberta. Guarde-a separadamente. O navegador
                  pode pedir autorização para baixar várias partes.
                </p>
              </>
            )}
            {summary && (
              <div className="verification-success" role="status">
                <ShieldCheck size={25} />
                <h3>Backup íntegro</h3>
                <p>
                  {summary.schoolName}
                  <br />
                  {summary.staff} servidores · {summary.documents} documentos · {summary.parts}{' '}
                  parte(s)
                </p>
                <small>
                  Gerado em {formatDate(summary.createdAt)}. Nenhum dado do portal foi alterado.
                </small>
              </div>
            )}
            {progress && (
              <p role="status" className="progress-message">
                <LoaderCircle size={17} className="spin" />
                {progress}
              </p>
            )}
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <Button
                secondary
                type="button"
                disabled={busy}
                onClick={() => {
                  setMode(null);
                  setPassword('');
                  setAgain('');
                }}
              >
                Fechar
              </Button>
              <Button type="submit" disabled={busy} icon={busy ? LoaderCircle : ShieldCheck}>
                {busy
                  ? 'Processando…'
                  : mode === 'export'
                    ? 'Gerar e baixar'
                    : 'Verificar arquivos'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
function HelpPage({ demo }: { demo: boolean }) {
  return (
    <div className="help-grid">
      <section className="panel prose">
        <span className="file-icon">
          <HelpCircle size={24} />
        </span>
        <h2>Como o portal funciona</h2>
        <h3>1. Comprove os dias</h3>
        <p>
          Entre com sua conta Google autorizada, preencha o formulário e anexe os PDFs originais.
        </p>
        <h3>2. Aguarde a conferência</h3>
        <p>
          A direção analisa os documentos e aprova os créditos. Se algo precisar de ajuste, você
          recebe a orientação no portal.
        </p>
        <h3>3. Combine suas folgas</h3>
        <p>
          A direção registra as datas. O agendamento reserva os dias; a confirmação do uso atualiza
          o histórico.
        </p>
        <h3>4. Acompanhe com clareza</h3>
        <p>
          Disponíveis são os créditos aprovados menos os dias usados e reservados. O prazo de
          funcionamento do portal não determina o vencimento do direito.
        </p>
      </section>
      <div>
        <section className="panel prose">
          <h2>Não conseguiu acessar?</h2>
          <p>
            Confirme se entrou com a conta Google informada à direção. Uma conta diferente não terá
            os mesmos acessos.
          </p>
          <p>
            Se o serviço estiver indisponível, procure a direção. O projeto gratuito pode ser
            pausado por pouca atividade e precisar de reativação no Supabase.
          </p>
          <p>
            A reativação é feita por responsável autorizado na infraestrutura, não pela senha de
            outro usuário.
          </p>
        </section>
        <section className="panel prose">
          <h2>Privacidade e suporte</h2>
          <p>
            Seu cadastro e seus PDFs são restritos às pessoas autorizadas. Evite utilizar
            computadores compartilhados sem sair da conta ao terminar.
          </p>
          <p>
            Identificação da escola, contato institucional, política de guarda e procedimento
            administrativo serão definidos antes da abertura oficial.
          </p>
          {demo && (
            <p className="setup-note">
              Esta versão é uma demonstração com dados fictícios. Alterações desaparecem ao sair;
              não envie dados reais.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
