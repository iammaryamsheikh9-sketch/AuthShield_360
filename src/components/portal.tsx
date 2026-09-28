"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AuthScreen } from "@/components/auth-screen";
import { PortalUser, useAuth } from "@/context/auth-context";

type Data = Record<string, any>;
type ViewId = "overview" | "records" | "attendance" | "roster" | "teaching" | "users" | "audit" | "tests" | "security";

const icons: Record<ViewId, string> = {
  overview: "◫", records: "▤", attendance: "◷", roster: "♙", teaching: "✎", users: "♧", audit: "≋", tests: "◇", security: "⬡"
};

async function api<T extends Data = Data>(path: string, data?: Data) {
  const response = await fetch(`/api${path}`, {
    method: data ? "POST" : "GET",
    credentials: "include",
    headers: data ? { "Content-Type": "application/json" } : undefined,
    body: data ? JSON.stringify(data) : undefined
  });
  const result = await response.json();
  if (!response.ok || result.success === false) throw new Error(result.message || `Request failed (${response.status})`);
  return result as T;
}

function toRows(value: unknown): Data[] {
  if (Array.isArray(value)) return value as Data[];
  if (value && typeof value === "object") return [value as Data];
  return [];
}

function readable(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return String((value as Data).username || (value as Data).studentId || (value as Data)._id || JSON.stringify(value));
  return String(value);
}

function Table({ rows, empty = "Nothing to display yet." }: { rows: Data[]; empty?: string }) {
  if (!rows.length) return <div className="px-5 py-10 text-center text-sm text-[var(--muted)]">{empty}</div>;
  const keys = Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).filter((key) => !["_id", "__v", "id", "passwordHash"].includes(key)).slice(0, 7);
  return <div className="table-wrap"><table className="w-full border-collapse text-left text-sm"><thead><tr>{keys.map((key) => <th key={key}>{key.replace(/([A-Z])/g, " $1")}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={String(row._id || row.id || index)}>{keys.map((key) => <td key={key} className="max-w-64 truncate text-[var(--ink)]">{readable(row[key])}</td>)}</tr>)}</tbody></table></div>;
}

function PageHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return <div className="mb-6"><p className="text-[11px] font-bold tracking-[.2em] text-[var(--green)]">CAMPUS WORKSPACE</p><h2 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">{title}</h2><p className="mt-2 text-sm text-[var(--muted)]">{subtitle}</p></div>;
}

export function Portal() {
  const { user, ready, setUser, signOut } = useAuth();
  const [view, setView] = useState<ViewId>("overview");
  const [data, setData] = useState<Data>({});
  const [students, setStudents] = useState<Data[]>([]);
  const [mfaEnrollment, setMfaEnrollment] = useState<Data | null>(null);
  const [emailEnrollmentStarted, setEmailEnrollmentStarted] = useState(false);
  const [emailDevelopmentOtp, setEmailDevelopmentOtp] = useState("");
  const [attendanceClass, setAttendanceClass] = useState("");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const role = user?.role || "User";
  const navItems = useMemo(() => {
    const items: { id: ViewId; label: string }[] = [{ id: "overview", label: "Overview" }];
    if (role === "Student") items.push({ id: "records", label: "My records" }, { id: "attendance", label: "Attendance" });
    if (role === "Teacher") items.push({ id: "roster", label: "Student roster" }, { id: "teaching", label: "Academic records" }, { id: "attendance", label: "Attendance" });
    if (role === "Administrator") items.push({ id: "users", label: "User access" }, { id: "attendance", label: "Attendance" }, { id: "audit", label: "Audit log" }, { id: "tests", label: "Security tests" });
    items.push({ id: "security", label: "Security settings" });
    return items;
  }, [role]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setError("");
    const load = async () => {
      try {
        let result: Data = {};
        if (view === "overview") {
          const [profile, studentData, attendanceData] = await Promise.all([
            api("/users/profile"),
            role === "Student" ? api("/students/profile").catch(() => ({})) : Promise.resolve({}),
            role === "Student" ? api("/students/attendance/me").catch(() => ({})) : Promise.resolve({})
          ]);
          result = { profile, studentData, attendanceData };
        } else if (view === "records") result = await api("/students/records");
        else if (view === "attendance") {
          if (role === "Student") result = await api("/students/attendance/me");
          else {
            const [attendanceResult, rosterResult] = await Promise.all([api("/students/attendance/all"), api("/students/all")]);
            result = { ...attendanceResult, students: rosterResult.students };
          }
        }
        else if (view === "roster") result = await api("/students/all");
        else if (view === "teaching") result = await api("/students/all");
        else if (view === "users") result = await api("/admin/users");
        else if (view === "audit") result = await api("/admin/audit-logs?limit=100");
        else if (view === "tests") result = await api("/admin/security-tests");
        else if (view === "security") result = await api("/mfa/status");
        if (!cancelled) {
          setData(result);
          if (result.students) {
            setStudents(toRows(result.students));
            setAttendanceClass((current) => current || String(result.students[0]?.className || ""));
          }
        }
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Unable to load this view.");
      }
    };
    load();
    return () => { cancelled = true; };
  }, [view, role, user]);

  async function createRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setFeedback("");
    setBusy(true);
    try {
      const raw = Object.fromEntries(new FormData(event.currentTarget).entries());
      const result = await api("/students/record", {
        ...raw,
        maxScore: Number(raw.maxScore) || 100,
        score: raw.score ? Number(raw.score) : null
      });
      setFeedback(result.message || "Academic record created.");
      event.currentTarget.reset();
      setView("teaching");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to create the record.");
    } finally { setBusy(false); }
  }

  async function gradeRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setFeedback("");
    setBusy(true);
    try {
      const raw = Object.fromEntries(new FormData(event.currentTarget).entries());
      const result = await api("/students/grade", { recordId: raw.recordId, score: Number(raw.score) });
      setFeedback(result.message || "Record graded.");
      event.currentTarget.reset();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to grade the record.");
    } finally { setBusy(false); }
  }

  async function markAttendance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setFeedback("");
    setBusy(true);
    try {
      const raw = Object.fromEntries(new FormData(event.currentTarget).entries());
      const classStudents = students.filter((student) => student.className === raw.className);
      const records = classStudents.map((student, index) => ({
        studentId: String(student._id),
        status: String(raw[`status-${index}`] || "present")
      }));
      const result = await api("/students/attendance/bulk", { date: raw.date, className: raw.className, records });
      setFeedback(result.message || "Attendance saved.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save attendance.");
    } finally { setBusy(false); }
  }

  async function updateUser(userId: string, raw: Data) {
    setError("");
    try {
      if (raw.roleName) await api("/admin/users/role", { userId, roleName: raw.roleName });
      if (raw.status) await api("/admin/users/status", { userId, status: raw.status });
      setFeedback("User access updated.");
      const result = await api("/admin/users");
      setData(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update the user.");
    }
  }

  async function enrollMfa() {
    setError("");
    try {
      setMfaEnrollment(await api("/mfa/enroll", {}));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to begin authenticator setup.");
    }
  }

  async function verifyMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      const result = await api("/mfa/verify", values);
      setFeedback(result.message || "Authenticator verified.");
      setMfaEnrollment(null);
      setView("security");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Authenticator verification failed.");
    }
  }

  async function disableMfa() {
    try {
      const result = await api("/mfa/disable", {});
      setFeedback(result.message || "Authenticator disabled.");
      setData({ enabled: false });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to disable the authenticator.");
    }
  }

  async function startEmailEnrollment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setFeedback("");
    try {
      const values = Object.fromEntries(new FormData(event.currentTarget).entries());
      const result = await api("/mfa/email/enroll", values);
      setEmailDevelopmentOtp(String(result.developmentOtp || ""));
      setEmailEnrollmentStarted(true);
      setFeedback(result.message || "Check your email for a verification code.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to start email verification.");
    }
  }

  async function verifyEmailEnrollment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      const values = Object.fromEntries(new FormData(event.currentTarget).entries());
      const result = await api("/mfa/email/verify", values);
      setFeedback(result.message || "Email sign-in verification enabled.");
      setEmailEnrollmentStarted(false);
      setEmailDevelopmentOtp("");
      setData(await api("/mfa/status"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to verify your email.");
    }
  }

  async function disableEmailFactor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      const values = Object.fromEntries(new FormData(event.currentTarget).entries());
      const result = await api("/mfa/email/disable", values);
      setFeedback(result.message || "Email sign-in verification disabled.");
      setData(await api("/mfa/status"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to disable email verification.");
    }
  }

  async function recordSecurityTest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      const result = await api("/admin/security-tests", { ...values, userRole: role });
      setFeedback(result.message || "Security test saved.");
      setView("tests");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to record this test.");
    }
  }

  if (!ready) return <div className="grid min-h-screen place-items-center text-sm text-[var(--muted)]">Preparing your secure workspace…</div>;
  if (!user) return <AuthScreen onAuthenticated={setUser} />;

  const heading = navItems.find((item) => item.id === view)?.label || "Overview";
  const student = data.studentData?.student || {};
  const recordCount = data.studentData?.records?.length ?? data.records?.length ?? 0;
  const attendance = data.attendanceData?.summary;
  const allStudents = toRows(data.students);
  const records = toRows(data.records);
  const users = toRows(data.users);
  const logs = toRows(data.logs);
  const tests = toRows(data.tests);

  return (
    <main className="min-h-screen md:flex">
      <aside className="flex w-full flex-col border-b border-[var(--line)] bg-white px-4 py-4 md:fixed md:inset-y-0 md:w-64 md:border-b-0 md:border-r md:px-5 md:py-6">
        <a className="flex items-center gap-3 px-2 text-base font-bold" href="/"><span className="grid size-9 place-items-center rounded-xl bg-[var(--green)] text-lg text-white">A</span>AuthShield <span className="-ml-3 text-[var(--green)]">360</span></a>
        <p className="mb-3 mt-8 hidden px-3 text-[10px] font-bold tracking-[.2em] text-[var(--muted)] md:block">WORKSPACE</p>
        <nav className="mt-5 flex gap-1 overflow-x-auto md:mt-0 md:flex-col" aria-label="Main navigation">
          {navItems.map((item) => <button key={item.id} type="button" className={`nav-item shrink-0 md:shrink ${view === item.id ? "active" : ""}`} onClick={() => { setView(item.id); setFeedback(""); }}>
            <span className="grid size-7 place-items-center rounded-lg bg-black/[.03] text-xs">{icons[item.id]}</span><span className="text-sm font-semibold">{item.label}</span>
          </button>)}
        </nav>
        <div className="mt-auto hidden border-t border-[var(--line)] pt-5 md:block">
          <div className="mb-4 flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-full bg-[var(--mint)] text-sm font-bold text-[var(--green)]">{user.username.slice(0, 2).toUpperCase()}</div>
            <div className="min-w-0"><p className="truncate text-sm font-semibold">{user.username}</p><p className="text-xs text-[var(--muted)]">{role}</p></div>
          </div>
          <button className="w-full rounded-xl border border-[var(--line)] px-3 py-2 text-left text-sm font-semibold text-[var(--muted)] hover:bg-[var(--paper)]" onClick={() => void signOut()}>Sign out <span className="float-right">→</span></button>
        </div>
      </aside>

      <section className="min-h-screen flex-1 px-4 py-6 md:ml-64 md:px-8 md:py-8 lg:px-12">
        <header className="mb-8 flex items-end justify-between border-b border-[var(--line)] pb-5">
          <div><p className="text-[10px] font-bold tracking-[.2em] text-[var(--green)]">AUTHSHIELD 360</p><h1 className="mt-2 text-2xl font-semibold tracking-tight">{heading}</h1></div>
          <div className="text-right"><p className="text-sm font-semibold">{new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</p><span className="mt-1 inline-block rounded-full bg-[var(--mint)] px-3 py-1 text-xs font-semibold text-[var(--green)]">{role}</span><button className="mt-1 block text-xs font-semibold text-[var(--green)] md:hidden" onClick={() => void signOut()}>Sign out</button></div>
        </header>
        {feedback && <p className="mb-5 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">{feedback}</p>}
        {error && <p className="mb-5 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">{error}</p>}

        {view === "overview" && <>
          <PageHeading title={`Good to see you, ${user.username}`} subtitle="Your campus access and account activity at a glance." />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Account status", user.status || "Active"],
              ["Campus role", role],
              ["Academic records", role === "Student" ? recordCount : "Portal access"],
              ["Attendance rate", attendance?.attendanceRate != null ? `${attendance.attendanceRate}%` : "View attendance"]
            ].map(([label, value]) => <article className="card p-5" key={label}><p className="text-xs font-semibold text-[var(--muted)]">{label}</p><p className="mt-4 text-2xl font-semibold">{value}</p><div className="mt-4 h-1.5 rounded-full bg-[var(--mint)]"><div className="h-full w-2/3 rounded-full bg-[var(--green)]" /></div></article>)}
          </div>
          <div className="mt-6 grid gap-5 lg:grid-cols-[1.3fr_.7fr]">
            <section className="card p-5 md:p-6"><h3 className="font-semibold">Account overview</h3><p className="mt-1 text-sm text-[var(--muted)]">Your identity information is protected by server-side session validation.</p><dl className="mt-6 grid gap-4 sm:grid-cols-2">{[["Username", user.username], ["Email", user.email || "Not available"], ["Role", role], ["Student ID", student.studentId || "—"], ["Class", student.className || "—"], ["Records", String(recordCount)]].map(([key, value]) => <div key={key}><dt className="text-xs text-[var(--muted)]">{key}</dt><dd className="mt-1 text-sm font-semibold">{value}</dd></div>)}</dl></section>
            <section className="card bg-[var(--ink)] p-6 text-white"><span className="text-xs font-bold tracking-widest text-emerald-300">SECURITY STATUS</span><h3 className="mt-4 text-xl font-semibold">Protected session</h3><p className="mt-2 text-sm leading-6 text-white/65">Your session is validated by the server. Browser storage contains profile details only, never your session token.</p><button className="mt-6 rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/15" onClick={() => setView("security")}>Review security settings →</button></section>
          </div>
        </>}

        {view === "records" && <><PageHeading title="Academic records" subtitle="View your assignments, grades, and academic progress." /><section className="card"><Table rows={records} /></section></>}
        {view === "roster" && <><PageHeading title="Student roster" subtitle="Students currently enrolled in your campus classes." /><section className="card"><Table rows={allStudents} /></section></>}
        {view === "teaching" && <><PageHeading title="Academic records" subtitle="Create student records and update grades." />
          <div className="grid gap-5 xl:grid-cols-2">
            <form className="card space-y-4 p-5" onSubmit={createRecord}><h3 className="font-semibold">Create academic record</h3>
              <label className="block space-y-2 text-sm font-medium">Student<select className="field" name="studentId" required defaultValue=""><option value="" disabled>Select a student record</option>{allStudents.map((item) => <option key={String(item._id)} value={String(item._id)}>{item.firstName} {item.lastName} · {item.studentId} ({item.className})</option>)}</select></label>
              <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-2 text-sm font-medium">Subject<input className="field" name="subject" required /></label><label className="space-y-2 text-sm font-medium">Type<select className="field" name="type"><option value="assignment">Assignment</option><option value="exam">Exam</option><option value="project">Project</option></select></label></div>
              <label className="block space-y-2 text-sm font-medium">Title<input className="field" name="title" required /></label>
              <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-2 text-sm font-medium">Maximum score<input className="field" name="maxScore" type="number" min="1" defaultValue="100" /></label><label className="space-y-2 text-sm font-medium">Due date<input className="field" name="dueDate" type="date" /></label></div>
              <button className="btn-primary w-full" disabled={busy}>Save academic record</button>
            </form>
            <div className="space-y-5"><form className="card space-y-4 p-5" onSubmit={gradeRecord}><h3 className="font-semibold">Record a grade</h3><label className="block space-y-2 text-sm font-medium">Record ID<input className="field" name="recordId" required /></label><label className="block space-y-2 text-sm font-medium">Score<input className="field" name="score" type="number" min="0" required /></label><button className="btn-primary w-full" disabled={busy}>Save grade</button></form>
              <section className="card"><div className="border-b border-[var(--line)] p-5"><h3 className="font-semibold">Student records</h3></div><Table rows={allStudents} /></section>
            </div>
          </div>
        </>}

        {view === "attendance" && <><PageHeading title="Attendance" subtitle={role === "Student" ? "Your attendance history and attendance rate." : "Review and record attendance for your classes."} />
          {role === "Student" ? <div className="space-y-5"><div className="grid gap-4 sm:grid-cols-3">{[["Attendance rate", data.summary?.attendanceRate == null ? "—" : `${data.summary.attendanceRate}%`], ["Present", data.summary?.present ?? 0], ["Absent", data.summary?.absent ?? 0]].map(([label, value]) => <div className="card p-5" key={label}><p className="text-xs text-[var(--muted)]">{label}</p><p className="mt-3 text-2xl font-semibold">{value}</p></div>)}</div><section className="card"><Table rows={toRows(data.records)} /></section></div> : <div className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
            <form className="card space-y-4 p-5" onSubmit={markAttendance}><h3 className="font-semibold">Record attendance</h3>
              <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-2 text-sm font-medium">Class<select className="field" name="className" value={attendanceClass} onChange={(event) => setAttendanceClass(event.target.value)} required><option value="" disabled>Select a class</option>{Array.from(new Set(allStudents.map((item) => String(item.className || "")))).filter(Boolean).map((className) => <option key={className}>{className}</option>)}</select></label><label className="space-y-2 text-sm font-medium">Date<input className="field" name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></label></div>
              <div className="max-h-72 space-y-2 overflow-y-auto">{allStudents.filter((item) => item.className === attendanceClass).map((item, index) => <label className="flex items-center justify-between gap-3 rounded-xl bg-[var(--paper)] p-3 text-sm" key={String(item._id)}><span>{item.firstName} {item.lastName}<small className="ml-2 text-[var(--muted)]">{item.studentId}</small></span><select className="rounded-lg border border-[var(--line)] bg-white px-2 py-1" name={`status-${index}`} defaultValue="present"><option>present</option><option>absent</option><option>late</option><option>excused</option></select></label>)}</div>
              {!allStudents.filter((item) => item.className === attendanceClass).length && <p className="text-sm text-[var(--muted)]">There are no students in this class yet.</p>}
              <button className="btn-primary w-full" disabled={busy || !allStudents.filter((item) => item.className === attendanceClass).length}>Save attendance</button>
            </form><section className="card"><div className="border-b border-[var(--line)] p-5"><h3 className="font-semibold">Attendance records</h3></div><Table rows={toRows(data.records)} empty="No attendance found for today." /></section>
          </div>}
        </>}

        {view === "users" && <><PageHeading title="User access" subtitle="Manage campus roles and account access." /><section className="card"><div className="divide-y divide-[var(--line)]">{users.map((item) => <div className="flex flex-wrap items-center justify-between gap-3 p-4" key={String(item.id)}><div><p className="font-semibold">{item.username}</p><p className="text-xs text-[var(--muted)]">{item.email} · {item.role} · {item.status}</p></div><div className="flex gap-2"><select className="rounded-lg border border-[var(--line)] px-2 py-2 text-xs" defaultValue={item.role} onChange={(event) => void updateUser(String(item.id), { roleName: event.target.value })}>{toRows(data.roles).map((r) => <option key={String(r._id)}>{r.name}</option>)}</select><select className="rounded-lg border border-[var(--line)] px-2 py-2 text-xs" defaultValue={item.status} onChange={(event) => void updateUser(String(item.id), { status: event.target.value })}><option>active</option><option>locked</option><option>disabled</option></select></div></div>)}</div></section></>}

        {view === "audit" && <><PageHeading title="Audit log" subtitle="Security and account events recorded by the portal." /><section className="card"><Table rows={logs} /></section></>}
        {view === "tests" && <><PageHeading title="Security tests" subtitle="Track security checks and their outcomes." /><div className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]"><section className="card"><Table rows={tests} /></section><form className="card space-y-4 p-5" onSubmit={recordSecurityTest}><h3 className="font-semibold">Record a test result</h3>{[["testId", "Test ID"], ["testAction", "Test action"], ["expectedResult", "Expected result"], ["actualResult", "Actual result"], ["notes", "Notes"]].map(([name, label]) => <label key={name} className="block space-y-2 text-sm font-medium">{label}<input className="field" name={name} required={["testId", "testAction"].includes(name)} /></label>)}<label className="block space-y-2 text-sm font-medium">Result<select className="field" name="status"><option>passed</option><option>failed</option><option>pending</option></select></label><button className="btn-primary w-full">Save test result</button></form></div></>}

        {view === "security" && <><PageHeading title="Security settings" subtitle="Choose password, authenticator, email verification, or combine both additional factors." /><div className="max-w-2xl space-y-5">
          <section className="card p-5 md:p-7"><div className="flex flex-wrap items-center justify-between gap-4"><div><h3 className="font-semibold">Authenticator app (TOTP)</h3><p className="mt-1 text-sm text-[var(--muted)]">{data.enabled ? "Enabled. You will verify a fresh code after your password whenever you sign in." : "Add a time-based one-time password authenticator."}</p></div>{data.enabled ? <button className="rounded-xl border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700" onClick={() => void disableMfa()}>Disable TOTP</button> : !mfaEnrollment && <button className="btn-primary" onClick={() => void enrollMfa()}>Set up authenticator</button>}</div>
            {mfaEnrollment && <div className="mt-6 rounded-2xl bg-[var(--paper)] p-5">
              {mfaEnrollment.qrCode && <img className="mb-4 size-44" src={mfaEnrollment.qrCode} alt="Authenticator enrollment QR code" />}
              <p className="text-sm leading-5 text-[var(--muted)]">Scan the code with your authenticator app. If this page is on the same phone, open the setup link or enter the key manually.</p>
              {mfaEnrollment.otpAuthUrl && <a className="mt-3 inline-flex rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm font-semibold text-[var(--green)]" href={mfaEnrollment.otpAuthUrl}>Open in authenticator app</a>}
              <p className="mt-4 text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Manual setup key</p>
              <code className="mt-2 block break-all rounded-lg bg-white px-3 py-2 text-sm">{mfaEnrollment.secret}</code>
              <p className="mt-2 text-xs leading-5 text-[var(--muted)]">Choose time-based (TOTP), 6 digits, with a 30-second interval. Enter the current code below to finish.</p>
              <form className="mt-5 flex flex-wrap gap-3" onSubmit={verifyMfa}><input className="field min-w-48 flex-1" name="otpCode" inputMode="numeric" maxLength={6} pattern="[0-9]{6}" placeholder="6-digit code" required /><button className="btn-primary">Verify authenticator</button></form>
            </div>}
          </section>

          <section className="card p-5 md:p-7"><div className="flex flex-wrap items-center justify-between gap-4"><div><h3 className="font-semibold">Email sign-in verification</h3><p className="mt-1 text-sm text-[var(--muted)]">{data.emailOtpEnabled ? `Enabled for ${user.email || "your verified email"}. ${data.enabled ? "After TOTP, you will also enter an email code." : "You will enter an email code after your password."}` : `Optional. Verify a code sent to ${user.email || "your account email"} at sign-in.`}</p></div>{data.emailOtpEnabled && <span className="rounded-full bg-[var(--mint)] px-3 py-1 text-xs font-semibold text-[var(--green)]">Enabled</span>}</div>
            {!data.emailOtpEnabled && !emailEnrollmentStarted && <form className="mt-5 space-y-3" onSubmit={startEmailEnrollment}>
              <label className="block space-y-2 text-sm font-medium">Confirm current password<input className="field" name="password" type="password" autoComplete="current-password" required /></label>
              {data.enabled && <label className="block space-y-2 text-sm font-medium">Verify current authenticator code<input className="field" name="totpCode" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="6-digit code" required /></label>}
              <button className="btn-primary">Enable email verification</button>
            </form>}
            {!data.emailOtpEnabled && emailEnrollmentStarted && <form className="mt-5 space-y-3" onSubmit={verifyEmailEnrollment}>
              {emailDevelopmentOtp && <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">Development email code: <strong>{emailDevelopmentOtp}</strong></p>}
              <label className="block space-y-2 text-sm font-medium">Enter the six-digit code sent to {user.email}<input className="field" name="otpCode" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required /></label>
              <div className="flex flex-wrap gap-3"><button className="btn-primary">Verify and enable email</button><button className="rounded-xl border border-[var(--line)] px-4 py-2 text-sm font-semibold" type="button" onClick={() => { setEmailEnrollmentStarted(false); setEmailDevelopmentOtp(""); }}>Cancel</button></div>
            </form>}
            {data.emailOtpEnabled && <form className="mt-5 space-y-3 border-t border-[var(--line)] pt-5" onSubmit={disableEmailFactor}>
              <p className="text-sm text-[var(--muted)]">To disable email verification, confirm your password{data.enabled ? " and current authenticator code" : ""}.</p>
              <label className="block space-y-2 text-sm font-medium">Current password<input className="field" name="password" type="password" autoComplete="current-password" required /></label>
              {data.enabled && <label className="block space-y-2 text-sm font-medium">Current authenticator code<input className="field" name="totpCode" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required /></label>}
              <button className="rounded-xl border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700">Disable email verification</button>
            </form>}
          </section>
        </div></>}
      </section>
    </main>
  );
}
