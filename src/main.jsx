import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Shield, ChevronDown, ArrowUpRight, Search, Bell, ClipboardList, Archive, Clock3, CheckCircle2, AlertTriangle, MessageSquare, X, Send, LogIn, Filter, Download, Copy, Eye, Menu, Crown, Flame, CircleDot, LogOut, UserRound, Sparkles } from 'lucide-react';
import { supabase } from './supabase';
import './styles.css';

const priorityClass = p => ({ 'Критическая':'critical', 'Высокая':'high', 'Обычная':'normal', 'Низкая':'low' }[p] || 'normal');
const statusClass = s => s === 'Ожидание' ? 'pending' : s === 'В работе' ? 'working' : s === 'Выполнено' ? 'done' : 'rejected';
const formatDate = value => new Intl.DateTimeFormat('ru-RU', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }).format(new Date(value));
const friendlyError = error => error?.message || 'Не удалось выполнить операцию. Попробуйте ещё раз.';

function App() {
  const [tasks, setTasks] = useState([]);
  const [view, setView] = useState('home');
  const [modal, setModal] = useState('');
  const [authMode, setAuthMode] = useState('login');
  const [selected, setSelected] = useState('');
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [messages, setMessages] = useState([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('Все');
  const [mobileNav, setMobileNav] = useState(false);
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ nick:'', title:'', detail:'', priority:'Обычная' });
  const [reply, setReply] = useState('');
  const [login, setLogin] = useState({ email:'', password:'', nickname:'' });

  const notify = useCallback(message => {
    setToast(message);
    window.clearTimeout(window.__chronosToast);
    window.__chronosToast = window.setTimeout(() => setToast(''), 3200);
  }, []);

  const refreshTasks = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from('tasks').select('*').order('created_at', { ascending:false });
    if (error) { notify(friendlyError(error)); return; }
    setTasks(data || []);
    setSelected(current => current || data?.[0]?.id || '');
  }, [notify]);

  const refreshMessages = useCallback(async taskId => {
    if (!supabase || !taskId) { setMessages([]); return; }
    const { data, error } = await supabase.from('task_messages').select('*').eq('task_id', taskId).order('created_at', { ascending:true });
    if (error) { notify(friendlyError(error)); return; }
    setMessages(data || []);
  }, [notify]);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    supabase.auth.getSession().then(({ data }) => { if (alive) setUser(data.session?.user || null); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user || null));
    refreshTasks();
    const channel = supabase.channel('chronos-live-updates')
      .on('postgres_changes', { event:'*', schema:'public', table:'tasks' }, refreshTasks)
      .on('postgres_changes', { event:'*', schema:'public', table:'task_messages' }, payload => {
        if (payload.new?.task_id === selected || payload.old?.task_id === selected) refreshMessages(selected);
      })
      .subscribe();
    return () => { alive = false; listener.subscription.unsubscribe(); supabase.removeChannel(channel); };
  }, [refreshTasks, refreshMessages, selected]);

  useEffect(() => {
    if (!supabase || !user) { setProfile(null); setIsAdmin(false); return; }
    let alive = true;
    Promise.all([
      supabase.from('profiles').select('nickname').eq('id', user.id).maybeSingle(),
      supabase.from('user_roles').select('role').eq('user_id', user.id).maybeSingle(),
    ]).then(([p, r]) => {
      if (!alive) return;
      if (p.error) notify(friendlyError(p.error));
      setProfile(p.data || null);
      setIsAdmin(r.data?.role === 'tech_admin');
    });
    return () => { alive = false; };
  }, [user, notify]);

  useEffect(() => { refreshMessages(selected); }, [selected, refreshMessages]);

  const current = tasks.find(task => task.id === selected) || tasks[0] || null;
  const visible = useMemo(() => tasks.filter(task => (filter === 'Все' || task.status === filter) && `${task.title} ${task.id} ${task.author_nickname}`.toLowerCase().includes(query.toLowerCase())), [tasks, filter, query]);
  const counts = {
    all: tasks.length,
    pending: tasks.filter(t => t.status === 'Ожидание').length,
    working: tasks.filter(t => t.status === 'В работе').length,
    done: tasks.filter(t => t.status === 'Выполнено').length,
  };

  const doAuth = async event => {
    event.preventDefault();
    if (!supabase) return notify('Не настроено подключение к Supabase.');
    setBusy(true);
    try {
      if (authMode === 'register') {
        const { data, error } = await supabase.auth.signUp({
          email: login.email.trim(), password: login.password,
          options: { data: { nickname: login.nickname.trim() }, emailRedirectTo: window.location.origin + window.location.pathname },
        });
        if (error) throw error;
        if (!data.session) notify('Аккаунт создан. Проверьте почту и подтвердите адрес для входа.');
        else notify('Аккаунт создан. Добро пожаловать в Chronos.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email:login.email.trim(), password:login.password });
        if (error) throw error;
        notify('Вход выполнен.');
      }
      setModal('');
      setLogin({ email:'', password:'', nickname:'' });
    } catch (error) { notify(friendlyError(error)); }
    finally { setBusy(false); }
  };

  const doLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) notify(friendlyError(error)); else { setView('home'); notify('Вы вышли из аккаунта.'); }
  };

  const createTask = async event => {
    event.preventDefault();
    if (!supabase) return notify('Не настроено подключение к базе данных.');
    setBusy(true);
    const { data, error } = await supabase.from('tasks').insert({
      title:form.title.trim(), description:form.detail.trim(), author_nickname:form.nick.trim(), priority:form.priority,
    }).select().single();
    setBusy(false);
    if (error) return notify(friendlyError(error));
    setForm({ nick:'', title:'', detail:'', priority:'Обычная' });
    setModal(''); setSelected(data.id); setView('tasks');
    await refreshTasks(); notify('Обращение отправлено в очередь Chronos.');
  };

  const updateTask = async (id, changes, success) => {
    const { error } = await supabase.from('tasks').update({ ...changes, updated_at:new Date().toISOString() }).eq('id', id);
    if (error) return notify(friendlyError(error));
    await refreshTasks(); notify(success);
  };
  const takeTask = id => updateTask(id, { status:'В работе', assignee_nickname:profile?.nickname || user?.email?.split('@')[0] || 'Техадмин' }, 'Задача взята в работу.');
  const rejectTask = id => updateTask(id, { status:'Архив · отклонено' }, 'Задача перемещена в архив.');
  const finishTask = id => updateTask(id, { status:'Выполнено' }, 'Задача завершена.');

  const sendReply = async event => {
    event.preventDefault();
    if (!reply.trim() || !current || !user) return;
    const { error } = await supabase.from('task_messages').insert({
      task_id:current.id, user_id:user.id, author_nickname:profile?.nickname || user.email?.split('@')[0] || 'Техадмин', author_role:'Техадмин', body:reply.trim(),
    });
    if (error) return notify(friendlyError(error));
    setReply(''); await refreshMessages(current.id); notify('Ответ добавлен в переписку.');
  };

  const shareText = async () => {
    if (!current) return;
    const text = `${current.title}\nАвтор: ${current.author_nickname}\nСтатус: ${current.status}\nПриоритет: ${current.priority}\nИсполнитель: ${current.assignee_nickname || 'Не назначен'}\n\n${current.description}\n\n${messages.map(m => `${m.author_nickname} (${formatDate(m.created_at)}): ${m.body}`).join('\n\n')}`;
    try { await navigator.clipboard.writeText(text); notify('Текст обращения и переписки скопирован.'); }
    catch { notify('Браузер запретил копирование. Разрешите доступ к буферу обмена.'); }
  };

  if (!supabase) return <div className="app-shell"><main className="main-area"><div className="content-wrap"><section className="panel" style={{padding:32,marginTop:48}}><h1>Chronos <i>не настроен</i></h1><p>Добавьте VITE_SUPABASE_URL и VITE_SUPABASE_PUBLISHABLE_KEY в .env.local, затем перезапустите Vite.</p></section></div></main></div>;

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav?'open':''}`}>
      <div className="brand"><div className="crest"><Shield size={23}/><span className="crest-dot"/></div><div><div className="brand-kicker">СЕРВЕР CHRONOS</div><div className="brand-name">Фембойские <em>шалости на техах</em></div></div></div>
      <div className="side-rule"><span>НАВИГАЦИЯ</span></div>
      <nav className="nav-list">
        <button className={`nav-item ${view==='home'?'active':''}`} onClick={()=>{setView('home');setMobileNav(false)}}><Flame size={17}/>Обзор</button>
        <button className={`nav-item ${view==='tasks'?'active':''}`} onClick={()=>{setView('tasks');setMobileNav(false)}}><ClipboardList size={17}/>Задачи <span className="nav-count">{counts.pending}</span></button>
        {isAdmin&&<button className={`nav-item ${view==='archive'?'active':''}`} onClick={()=>{setView('archive');setMobileNav(false)}}><Archive size={17}/>Архив</button>}
      </nav>
      <div className="sidebar-bottom"><div className="side-rule"><span>СТАТУС СИСТЕМЫ</span></div><div className="system-status"><span className="status-light"/><div><b>Система активна</b><small>Облачная база Chronos</small></div></div><div className="sidebar-quote">«каждый тех - фембой и это точка»<i>— Кодекс Chronos</i></div><div className="side-version">PORTAL · V1.0 / LIVE</div></div>
    </aside>

    <main className="main-area">
      <header className="topbar"><button className="mobile-menu icon-button" onClick={()=>setMobileNav(v=>!v)}><Menu size={19}/></button><div className="breadcrumbs"><span>ОРДЕН</span><span className="crumb-slash">/</span><b>{view==='home'?'ОБЗОР':view==='archive'?'АРХИВ':'ЗАДАЧИ'}</b></div><div className="top-actions"><div className="live-indicator"><span/>LIVE</div><button className="icon-button bell" onClick={()=>notify('Новых уведомлений нет')}><Bell size={18}/><i/></button><div className="top-divider"/><button className="user-menu" onClick={()=>user?doLogout(): (setAuthMode('login'),setModal('login'))}><div className="avatar">{user?(profile?.nickname||user.email||'?').slice(0,1).toUpperCase():'?'}</div><div className="user-meta"><b>{user?(profile?.nickname||user.email):'Гость'}</b><small>{user?(isAdmin?'Технический администратор':'Участник'):'Без авторизации'}</small></div>{user?<LogOut size={14}/>:<ChevronDown size={14}/>}</button></div></header>

      <div className="content-wrap">
        {view==='home'&&<>
          <section className="hero-row"><div><div className="eyebrow"><span className="eyebrow-line"/>СЛУЖБА ПОДДЕРЖКИ CHRONOS</div><h1>Задачи и <i>обращения</i></h1><p className="hero-copy">Единое пространство для предложений, технических вопросов<br className="desktop-only"/> и решений, которые двигают Chronos вперёд.</p></div><div className="hero-seal"><div className="seal-ring"><Shield size={36}/><span>✦</span></div><small>ЧЕСТЬ · ПОРЯДОК · ДЕЛО</small></div></section>
          <section className="stats-grid"><Stat label="Всего обращений" value={counts.all.toString().padStart(2,'0')} detail="за всё время" icon={<ClipboardList size={17}/>}/><Stat label="Ожидают разбора" value={counts.pending.toString().padStart(2,'0')} detail="требуют внимания" icon={<Clock3 size={17}/>}/><Stat label="В работе" value={counts.working.toString().padStart(2,'0')} detail="уже приняты" icon={<CircleDot size={17}/>}/><Stat label="Завершено" value={counts.done.toString().padStart(2,'0')} detail="решённые вопросы" icon={<CheckCircle2 size={17}/>}/></section>
          <section className="home-grid"><div className="panel recent-panel"><div className="panel-heading"><div><div className="eyebrow small">ПОСЛЕДНИЕ ОБРАЩЕНИЯ</div><h2>Журнал задач</h2></div><button className="text-link" onClick={()=>setView('tasks')}>Все задачи <ArrowUpRight size={15}/></button></div><div className="task-list">{tasks.slice(0,4).map(t=><TaskRow key={t.id} task={t} onClick={()=>{setSelected(t.id);setView('tasks')}}/>)}{tasks.length===0&&<div className="empty-state">Пока нет обращений. Создайте первую задачу.</div>}</div></div>
            <div className="panel create-panel"><div className="create-icon"><Sparkles size={20}/></div><div className="eyebrow small">ЕСТЬ ПРЕДЛОЖЕНИЕ?</div><h2>Оставить <i>обращение</i></h2><p>Опишите вопрос — он появится в общем реестре и будет доступен технической команде.</p><div className="create-benefits"><div><span className="gold-check">✓</span> Без регистрации</div><div><span className="gold-check">✓</span> Общий статус</div></div><button className="primary-button wide" onClick={()=>setModal('task')}>Оставить задачу <ArrowUpRight size={16}/></button><div className="login-hint">Уже состоите на Chronos? <button onClick={()=>{setAuthMode('login');setModal('login')}}>Войти в аккаунт</button></div></div></section>
          <section className="bottom-note"><div className="note-emblem"><Crown size={16}/></div><div><b>Каждое обращение имеет значение</b><span>Служба технической поддержки рассматривает задачи по степени важности.</span></div><span className="note-code">OZP / 01</span></section>
        </>}

        {(view==='tasks'||view==='archive')&&<section className="tasks-view"><div className="view-heading"><div><div className="eyebrow"><span className="eyebrow-line"/>УПРАВЛЕНИЕ ОБРАЩЕНИЯМИ</div><h1>{view==='archive'?<>Архив <i>решений</i></>:<>Реестр <i>задач</i></>}</h1><p>{isAdmin?'Полный список обращений, их состояние и история взаимодействия.':'Отслеживайте состояние обращений, отправленных в Орден.'}</p></div>{isAdmin&&<button className="outline-button" onClick={shareText}><Download size={15}/> Экспорт переписки</button>}</div>
          <div className="task-toolbar"><div className="searchbox"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Поиск по задачам..."/></div><div className="filter-wrap"><Filter size={15}/><select value={filter} onChange={e=>setFilter(e.target.value)}><option>Все</option><option>Ожидание</option><option>В работе</option><option>Выполнено</option><option>Архив · отклонено</option></select></div></div>
          <div className="tasks-layout"><div className="panel tasks-table"><div className="table-head"><span>ОБРАЩЕНИЕ</span><span>ПРИОРИТЕТ</span><span>СТАТУС</span></div>{visible.filter(t=>view!=='archive'||t.status==='Архив · отклонено').map(t=><button className={`table-row ${selected===t.id?'selected':''}`} key={t.id} onClick={()=>setSelected(t.id)}><div className="task-main"><b>{t.title}</b><small>{t.author_nickname} · {formatDate(t.created_at)}</small></div><span className={`priority ${priorityClass(t.priority)}`}>{t.priority}</span><span className={`status-pill ${statusClass(t.status)}`}>{t.status}</span></button>)}{visible.filter(t=>view!=='archive'||t.status==='Архив · отклонено').length===0&&<div className="empty-state">По заданным условиям задач не найдено.</div>}</div>
            {current&&<div className="panel detail-panel"><div className="detail-top"><div className="eyebrow small">КАРТОЧКА ОБРАЩЕНИЯ</div><button className="icon-button" onClick={shareText} title="Скопировать переписку"><Copy size={16}/></button></div><h2>{current.title}</h2><div className="detail-meta"><span className={`status-pill ${statusClass(current.status)}`}>{current.status}</span><span className={`priority ${priorityClass(current.priority)}`}>{current.priority}</span></div><div className="detail-description">{current.description}</div><div className="detail-facts"><div><small>АВТОР</small><b>{current.author_nickname}</b></div><div><small>ИСПОЛНИТЕЛЬ</small><b>{current.assignee_nickname||'Не назначен'}</b></div><div><small>СОЗДАНО</small><b>{formatDate(current.created_at)}</b></div></div>
              <div className="conversation"><div className="conversation-title"><MessageSquare size={15}/> Переписка <span>{messages.length}</span></div>{messages.map(m=><div className="message" key={m.id}><div className="message-avatar">{m.author_nickname.slice(0,1).toUpperCase()}</div><div className="message-body"><div><b>{m.author_nickname}</b><span>{formatDate(m.created_at)}</span></div><small>{m.author_role}</small><p>{m.body}</p></div></div>)}{messages.length===0&&<div className="empty-state">Ответов пока нет.</div>}</div>
              {isAdmin&&<><form className="reply-form" onSubmit={sendReply}><input value={reply} onChange={e=>setReply(e.target.value)} placeholder="Написать ответ..."/><button className="send-button" type="submit"><Send size={15}/></button></form><div className="admin-actions">{current.status==='Ожидание'&&<><button className="primary-button" onClick={()=>takeTask(current.id)}>Взять в работу</button><button className="danger-button" onClick={()=>rejectTask(current.id)}>Отклонить</button></>}{current.status==='В работе'&&<button className="primary-button" onClick={()=>finishTask(current.id)}>Завершить задачу</button>}<button className="share-button" onClick={shareText}><Copy size={14}/> Поделиться текстом</button><button className="share-button" onClick={()=>window.print()}><Eye size={14}/> Скриншот / печать</button></div></>}
              {!isAdmin&&<div className="detail-footnote">Технические ответы и управление задачами доступны назначенным техадминам.</div>}
            </div>}
          </div>
        </section>}
      </div>
      <footer className="footer"><span>© 2026 CHRONOS · ФЕМБОЙСКИЕ ШАЛОСТИ НА ТЕХАХ</span><span>СИСТЕМА ОБРАЩЕНИЙ <b>·</b> LIVE</span></footer>
    </main>

    {modal&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setModal('')}}><div className="modal"><div className="modal-head"><div><div className="eyebrow small">{modal==='task'?'НОВОЕ ОБРАЩЕНИЕ':'ДОСТУП В ОРДЕН'}</div><h2>{modal==='task'?'Оставить задачу':authMode==='register'?'Создать аккаунт':'Войти в аккаунт'}</h2></div><button className="icon-button" onClick={()=>setModal('')}><X size={19}/></button></div>{modal==='task'?<form className="modal-form" onSubmit={createTask}><label>Ваш никнейм<input required minLength="2" maxLength="32" value={form.nick} onChange={e=>setForm({...form,nick:e.target.value})} placeholder="Например, RavenFox"/></label><label>Краткая суть<input required minLength="3" maxLength="120" value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="Что необходимо сделать?"/></label><label>Подробное описание<textarea required minLength="10" maxLength="5000" rows="4" value={form.detail} onChange={e=>setForm({...form,detail:e.target.value})} placeholder="Опишите проблему, ожидаемый результат и важные детали..."/></label><label>Срочность<select value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})}><option>Низкая</option><option>Обычная</option><option>Высокая</option><option>Критическая</option></select></label><div className="form-note"><AlertTriangle size={14}/> После отправки обращение появится в общем реестре.</div><button className="primary-button wide" disabled={busy} type="submit">{busy?'Отправка...':'Отправить обращение'} <ArrowUpRight size={16}/></button></form>:<form className="modal-form" onSubmit={doAuth}>{authMode==='register'&&<label>Ваш никнейм<input required minLength="2" maxLength="32" value={login.nickname} onChange={e=>setLogin({...login,nickname:e.target.value})} placeholder="Например, RavenFox"/></label>}<label>Электронная почта<input type="email" required value={login.email} onChange={e=>setLogin({...login,email:e.target.value})} placeholder="name@example.com"/></label><label>Пароль<input type="password" minLength="8" required value={login.password} onChange={e=>setLogin({...login,password:e.target.value})} placeholder="Минимум 8 символов"/></label><div className="form-note"><Shield size={14}/> Авторизация защищена Supabase Auth. Роль техадмина назначается отдельно.</div><button className="primary-button wide" disabled={busy} type="submit">{busy?'Подождите...':authMode==='register'?'Создать аккаунт':'Войти'} <LogIn size={16}/></button><p className="signup-note">{authMode==='register'?'Уже есть аккаунт? ':'Нет аккаунта? '}<button type="button" onClick={()=>setAuthMode(authMode==='register'?'login':'register')}>{authMode==='register'?'Войти':'Зарегистрироваться'}</button></p></form>}</div></div>}
    {toast&&<div className="toast"><CheckCircle2 size={16}/>{toast}</div>}
  </div>;
}

function Stat({label,value,detail,icon}){return <div className="stat-card"><div className="stat-top"><span>{label}</span><span className="stat-icon">{icon}</span></div><div className="stat-value">{value}</div><div className="stat-detail">{detail}</div></div>}
function TaskRow({task,onClick}){return <button className="recent-task" onClick={onClick}><div className="recent-task-main"><span className="task-id">{task.id.slice(0,8)}</span><b>{task.title}</b><small>{task.author_nickname} <i>·</i> {formatDate(task.created_at)}</small></div><div className="recent-task-side"><span className={`priority ${priorityClass(task.priority)}`}>{task.priority}</span><span className={`status-pill ${statusClass(task.status)}`}>{task.status}</span></div><ArrowUpRight className="recent-arrow" size={16}/></button>}

createRoot(document.getElementById('root')).render(<App/>);
