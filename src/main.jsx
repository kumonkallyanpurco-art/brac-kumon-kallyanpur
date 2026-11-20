// Dashboard refresh: remove visible date/time labels; keep date logic internal.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { supabase } from './lib/supabase';
import './style.css';

const emptyStudent = {
  student_id: '', full_name: '', subject: 'Math', admission_date: '',
  class_start_date: '', stop_billing_from: '', class_days: 'Saturday & Tuesday', class_time: '11:00',
  current_status: 'Active', no_fee: false, consent_from: 'No', znzn: 'No', starting_math_level: '', starting_english_level: '', exclude_from_subject_totals: false, status_effective_date: '', school_class: '', medium: '', remarks: ''
};
const APP_TIME_ZONE = 'Asia/Dhaka';
const dhakaDateParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit'
}).formatToParts(new Date()).reduce((parts, part) => ({ ...parts, [part.type]: part.value }), {});
const todayDhaka = `${dhakaDateParts.year}-${dhakaDateParts.month}-${dhakaDateParts.day}`;
const times = ['11:00', '12:00', '14:00', '15:00', '16:00', '17:00'];
const formatClassTime = value => {
  if (!value) return '—';
  const [hourText, minuteText = '00'] = String(value).slice(0, 5).split(':');
  const hour = Number(hourText);
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return String(value);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minuteText} ${suffix}`;
};
const money = value => new Intl.NumberFormat('en-BD', { maximumFractionDigits: 0 }).format(value || 0);

function getMonthlyFeeDefault(student, month, year, subjectChanges) {
  const monthStart = new Date(Number(year), Number(month) - 1, 1);
  const nextMonth = new Date(Number(year), Number(month), 1);
  const asDate = value => value ? new Date(String(value).slice(0, 10) + 'T00:00:00') : null;
  if (student.no_fee) return { plan: 'Exempt', amount: 0, subject: student.subject };
  const startDate = asDate(student.class_start_date);
  const stopDate = asDate(student.stop_billing_from);
  if (startDate && startDate >= nextMonth) return { plan: 'No Fee', amount: 0, subject: student.subject };
  if (stopDate) {
    const stopMonth = new Date(stopDate.getFullYear(), stopDate.getMonth(), 1);
    if (monthStart >= stopMonth) return { plan: 'No Fee', amount: 0, subject: student.subject };
  } else if ((student.current_status || 'Active') !== 'Active') {
    return { plan: 'No Fee', amount: 0, subject: student.subject };
  }
  const applicableChanges = (subjectChanges || [])
    .filter(change => change.student_id === student.id && asDate(change.charged_from) && asDate(change.charged_from) <= monthStart)
    .sort((a, b) => String(b.charged_from).localeCompare(String(a.charged_from)));
  const subject = applicableChanges[0]?.new_subject || student.subject;
  const halfMonth = !!(startDate && startDate >= monthStart && startDate < nextMonth && startDate.getDate() >= 15);
  const plan = halfMonth ? 'Half Month' : 'Full Month';
  const both = subject === 'Both';
  return { plan, amount: halfMonth ? (both ? 2955 : 1650) : (both ? 5400 : 3000), subject };
}

function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyStudent);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [profileHistory, setProfileHistory] = useState([]);
  const [profileAttendance, setProfileAttendance] = useState([]);
  const [profileTab, setProfileTab] = useState('Overview');
  const [profileLoading, setProfileLoading] = useState(false);

  const [activeTab, setActiveTab] = useState('Dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [studentMenuOpen, setStudentMenuOpen] = useState(false);
  const [attendanceRows, setAttendanceRows] = useState([]);
  const [historyRows, setHistoryRows] = useState([]);
  const [attendanceDate, setAttendanceDate] = useState(todayDhaka);
  const [attendanceStudent, setAttendanceStudent] = useState('');
  const [attendanceValue, setAttendanceValue] = useState('Present');
  const [historyStudent, setHistoryStudent] = useState('');
  const [historyDate, setHistoryDate] = useState(todayDhaka);
  const [historyType, setHistoryType] = useState('Level Change');
  const [historySubject, setHistorySubject] = useState('Math');
  const [historyPrevious, setHistoryPrevious] = useState('');
  const [historyNew, setHistoryNew] = useState('');
  const [entryRemarks, setEntryRemarks] = useState('');
  const [feeRows, setFeeRows] = useState([]);
  const [feeAssessments, setFeeAssessments] = useState([]);
  const [subjectChanges, setSubjectChanges] = useState([]);
  const [feeStudent, setFeeStudent] = useState('');
  const [feeType, setFeeType] = useState('Monthly Fee');
  const [feeDate, setFeeDate] = useState(todayDhaka);
  const [feeMonth, setFeeMonth] = useState(String(Number(dhakaDateParts.month)));
  const [feeYear, setFeeYear] = useState(dhakaDateParts.year);
  const [feeAmount, setFeeAmount] = useState('');
  const [feeExpected, setFeeExpected] = useState('');
  const [feePlan, setFeePlan] = useState('Full Month');
  const [feeMethod, setFeeMethod] = useState('Cash');
  const [feeReceipt, setFeeReceipt] = useState('');
  const [feeRemarks, setFeeRemarks] = useState('');
  const [employees, setEmployees] = useState([]);
  const [clockNow, setClockNow] = useState(() => new Date());
  const [dashboardIncomeRows, setDashboardIncomeRows] = useState([]);
  const [dashboardTodayIncomeRows, setDashboardTodayIncomeRows] = useState([]);
  const [dashboardExpenseRows, setDashboardExpenseRows] = useState([]);
  const [dashboardEmployeeAttendance, setDashboardEmployeeAttendance] = useState([]);
  const [dashboardRoyaltyRecord, setDashboardRoyaltyRecord] = useState(null);
  const [dashboardRoyaltyRate, setDashboardRoyaltyRate] = useState(0.42);
  const [dashboardDataLoading, setDashboardDataLoading] = useState(false);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [employeeStatusFilter, setEmployeeStatusFilter] = useState('All');
  const [employeeFormOpen, setEmployeeFormOpen] = useState(false);
  const [editingEmployeeId, setEditingEmployeeId] = useState(null);
  const [employeeForm, setEmployeeForm] = useState({
    employee_code: '', full_name: '', designation: '', joining_date: '',
    monthly_salary: '', office_start_time: '10:00', office_end_time: '18:00',
    status: 'Active', phone: '', remarks: ''
  });


  const isAdmin = profile?.role === 'admin';

  useEffect(() => {
    const timer = setInterval(() => setClockNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const dashboardToday = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(clockNow);
  const dashboardMonthStart = dashboardToday.slice(0, 8) + '01';
  const dashboardMonthEnd = (() => {
    const [year, month] = dashboardToday.split('-').map(Number);
    return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  })();
  const dashboardMonthLabel = new Intl.DateTimeFormat('en', {
    timeZone: APP_TIME_ZONE, month: 'long', year: 'numeric'
  }).format(clockNow);
  const dashboardDateLabel = new Intl.DateTimeFormat('en-GB', {
    timeZone: APP_TIME_ZONE, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  }).format(clockNow);
  const dashboardTimeLabel = new Intl.DateTimeFormat('en-GB', {
    timeZone: APP_TIME_ZONE, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
  }).format(clockNow);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setProfile(null);
      setError('');
    });
    return () => subscription.unsubscribe();
  }, []);

  const loadData = useCallback(async () => {
    if (!session || !supabase) return;
    setLoading(true);
    setError('');
    const { data: profileData, error: profileError } = await supabase
      .from('user_profiles')
      .select('user_id, role, is_active, full_name')
      .eq('user_id', session.user.id)
      .single();
    if (profileError) {
      setError('Could not load your user profile: ' + profileError.message);
      setLoading(false);
      return;
    }
    if (!profileData?.is_active) {
      setError('Your account is inactive. Please contact the administrator.');
      await supabase.auth.signOut();
      setLoading(false);
      return;
    }
    setProfile(profileData);
    if (profileData.role === 'admin') {
      const { data: employeeData, error: employeeError } = await supabase
        .from('employees')
        .select('id, employee_code, full_name, designation, joining_date, monthly_salary, office_start_time, office_end_time, status, phone, remarks')
        .order('full_name', { ascending: true })
        .limit(500);
      if (employeeError) setError('Could not load employees: ' + employeeError.message);
      else setEmployees(employeeData || []);
    } else {
      setEmployees([]);
    }
    const { data, error: studentsError } = await supabase
      .from('students')
      .select('id, student_id, full_name, subject, admission_date, class_start_date, stop_billing_from, status_effective_date, class_days, class_time, current_class_days, current_class_time, current_status, enrollment_status, school_class, medium, remarks, no_fee, consent_from, znzn, starting_math_level, starting_english_level, exclude_from_subject_totals')
      .order('full_name', { ascending: true })
      .limit(1000);
    if (studentsError) setError('Could not load students: ' + studentsError.message);
    else setStudents(data || []);
    setLoading(false);
  }, [session]);

  useEffect(() => { loadData(); }, [loadData]);

  const loadDashboardData = useCallback(async () => {
    if (!session || !isAdmin) return;
    setDashboardDataLoading(true);
    const [incomeResult, todayIncomeResult, attendanceResult, royaltyResult, settingsResult] = await Promise.all([
      supabase.from('fee_payments').select('id, payment_date, fee_type, amount')
        .in('fee_type', ['Monthly Fee', 'Enrollment Fee'])
        .gte('payment_date', dashboardMonthStart).lte('payment_date', dashboardMonthEnd),
      supabase.from('fee_payments').select('id, payment_date, fee_type, amount')
        .in('fee_type', ['Monthly Fee', 'Enrollment Fee']).eq('payment_date', dashboardToday),
      supabase.from('employee_attendance')
        .select('employee_id, attendance_status, employees!inner(status)')
        .eq('attendance_date', dashboardToday),
      supabase.from('royalty_records').select('kumon_amount')
        .eq('royalty_year', Number(dashboardToday.slice(0, 4)))
        .eq('royalty_month', Number(dashboardToday.slice(5, 7))).limit(1),
      supabase.from('center_settings').select('royalty_rate').limit(1).maybeSingle()
    ]);
    if (incomeResult.error) setError('Could not load monthly fee income: ' + incomeResult.error.message);
    else setDashboardIncomeRows(incomeResult.data || []);
    if (todayIncomeResult.error) setError('Could not load today income: ' + todayIncomeResult.error.message);
    else setDashboardTodayIncomeRows(todayIncomeResult.data || []);
    if (attendanceResult.error) setError('Could not load employee attendance summary: ' + attendanceResult.error.message);
    else setDashboardEmployeeAttendance((attendanceResult.data || []).filter(row => row.employees?.status === 'Active'));
    if (royaltyResult.error) setError('Could not load Kumon royalty: ' + royaltyResult.error.message);
    else setDashboardRoyaltyRecord(royaltyResult.data?.[0] || null);
    if (settingsResult.error) setError('Could not load royalty rate: ' + settingsResult.error.message);
    else if (settingsResult.data?.royalty_rate != null) setDashboardRoyaltyRate(Number(settingsResult.data.royalty_rate));
    setDashboardDataLoading(false);
  }, [session, isAdmin, dashboardMonthStart, dashboardMonthEnd, dashboardToday]);

  useEffect(() => {
    if (activeTab === 'Dashboard' && isAdmin) loadDashboardData();
  }, [activeTab, isAdmin, loadDashboardData]);


  const loadAttendance = useCallback(async () => {
    const { data, error: e } = await supabase.from('student_attendance')
      .select('id, student_id, class_date, attendance, remarks, students(student_id, full_name)')
      .order('class_date', { ascending: false }).limit(500);
    if (e) setError(e.message); else setAttendanceRows(data || []);
  }, []);

  const loadHistory = useCallback(async () => {
    const { data, error: e } = await supabase.from('student_history')
      .select('id, student_id, event_date, event_type, subject, previous_level, new_level, test_level, test_result, previous_class_days, new_class_days, previous_status, new_status, remarks, students(student_id, full_name)')
      .order('event_date', { ascending: false }).limit(500);
    if (e) setError(e.message); else setHistoryRows(data || []);
  }, []);

  useEffect(() => {
    if (session && activeTab === 'Attendance') loadAttendance();
    if (session && activeTab === 'History') loadHistory();
  }, [session, activeTab, loadAttendance, loadHistory]);

  async function saveAttendance(event) {
    event.preventDefault();
    if (!isAdmin || !attendanceStudent) return;
    setSaving(true); setError(''); setNotice('');
    const { error: e } = await supabase.from('student_attendance').upsert({
      student_id: attendanceStudent, class_date: attendanceDate,
      attendance: attendanceValue, remarks: entryRemarks || null, created_by: session.user.id
    }, { onConflict: 'student_id,class_date' });
    if (e) setError(e.message);
    else { setNotice('Attendance saved.'); setEntryRemarks(''); await loadAttendance(); }
    setSaving(false);
  }

  async function saveHistory(event) {
    event.preventDefault();
    if (!isAdmin || !historyStudent) return;
    setSaving(true); setError(''); setNotice('');
    const row = { student_id: historyStudent, event_date: historyDate, event_type: historyType, subject: historySubject, remarks: entryRemarks || null, created_by: session.user.id };
    if (historyType === 'Level Change') { row.previous_level = historyPrevious || null; row.new_level = historyNew || null; }
    else if (historyType === 'Achievement Test') { row.test_level = historyPrevious || null; row.test_result = historyNew || null; }
    else if (historyType === 'Schedule Change') { row.previous_class_days = historyPrevious || null; row.new_class_days = historyNew || null; }
    else if (historyType === 'Status Change') { row.previous_status = historyPrevious || null; row.new_status = historyNew || null; }
    else row.discontinued_reason_or_transfer_centre = historyNew || historyPrevious || null;
    const { error: e } = await supabase.from('student_history').insert(row);
    if (e) setError(e.message);
    else { setNotice('History event added.'); setHistoryPrevious(''); setHistoryNew(''); setEntryRemarks(''); await loadHistory(); }
    setSaving(false);
  }


  const loadFees = useCallback(async () => {
    if (!isAdmin) return;
    const [paymentsResult, assessmentsResult, changesResult] = await Promise.all([
      supabase.from('fee_payments')
        .select('id, student_id, payment_date, fee_type, fee_for_month, fee_for_year, amount, method, receipt_no, remarks, students(student_id, full_name, subject, no_fee)')
        .order('payment_date', { ascending: false }).limit(3000),
      supabase.from('monthly_fee_assessments')
        .select('id, student_id, fee_for_month, fee_for_year, fee_plan, expected_amount, subject_snapshot, remarks'),
      supabase.from('subject_changes')
        .select('id, student_id, change_date, charged_from, previous_subject, new_subject')
        .order('charged_from', { ascending: false })
    ]);
    if (paymentsResult.error) setError('Could not load fee payments: ' + paymentsResult.error.message);
    else setFeeRows(paymentsResult.data || []);
    if (assessmentsResult.error) setError('Could not load monthly fee plans: ' + assessmentsResult.error.message);
    else setFeeAssessments(assessmentsResult.data || []);
    if (changesResult.error) setError('Could not load subject changes: ' + changesResult.error.message);
    else setSubjectChanges(changesResult.data || []);
  }, [isAdmin]);

  useEffect(() => {
    if (session && isAdmin && activeTab === 'Fees') loadFees();
  }, [session, isAdmin, activeTab, loadFees]);

  function applyFeeDefaults(studentId, month = feeMonth, year = feeYear) {
    const student = students.find(s => s.id === studentId);
    if (!student) { setFeeExpected(''); setFeeAmount(''); return; }
    const assessment = feeAssessments.find(a => a.student_id === studentId && a.fee_for_month === Number(month) && a.fee_for_year === Number(year));
    const calculated = getMonthlyFeeDefault(student, month, year, subjectChanges);
    const plan = assessment?.fee_plan || calculated.plan;
    const expected = assessment ? Number(assessment.expected_amount) : calculated.amount;
    setFeePlan(['Full Month','Half Month','Custom'].includes(plan) ? plan : 'Full Month');
    setFeeExpected(String(expected));
    setFeeAmount('');
  }

  async function saveFeeAssessment() {
    if (!isAdmin || !feeStudent || !(Number(feeExpected) > 0)) {
      setError('Select a student and enter a valid expected monthly fee first.');
      return;
    }
    setSaving(true); setError(''); setNotice('');
    const student = students.find(s => s.id === feeStudent);
    const calculated = student ? getMonthlyFeeDefault(student, feeMonth, feeYear, subjectChanges) : null;
    const { error: assessmentError } = await supabase.from('monthly_fee_assessments').upsert({
      student_id: feeStudent,
      fee_for_month: Number(feeMonth),
      fee_for_year: Number(feeYear),
      fee_plan: feePlan,
      expected_amount: Number(feeExpected),
      subject_snapshot: calculated?.subject || student?.subject || null,
      created_by: session.user.id
    }, { onConflict: 'student_id,fee_for_month,fee_for_year' });
    if (assessmentError) setError('Could not save the monthly fee plan: ' + assessmentError.message);
    else { setNotice('Monthly fee plan saved.'); await loadFees(); }
    setSaving(false);
  }

  async function saveFee(event) {
    event.preventDefault();
    if (!isAdmin || !feeStudent || !(Number(feeAmount) > 0)) return;
    if (feeType === 'Monthly Fee' && !(Number(feeExpected) > 0)) {
      setError('Set a valid expected monthly fee before recording this payment.');
      return;
    }
    setSaving(true); setError(''); setNotice('');
    if (feeType === 'Monthly Fee') {
      const student = students.find(s => s.id === feeStudent);
      const calculated = student ? getMonthlyFeeDefault(student, feeMonth, feeYear, subjectChanges) : null;
      const assessmentRow = {
        student_id: feeStudent,
        fee_for_month: Number(feeMonth),
        fee_for_year: Number(feeYear),
        fee_plan: feePlan,
        expected_amount: Number(feeExpected),
        subject_snapshot: calculated?.subject || student?.subject || null,
        created_by: session.user.id
      };
      const { error: assessmentError } = await supabase.from('monthly_fee_assessments')
        .upsert(assessmentRow, { onConflict: 'student_id,fee_for_month,fee_for_year' });
      if (assessmentError) {
        setError('Could not save the monthly fee plan: ' + assessmentError.message);
        setSaving(false);
        return;
      }
    }
    const row = {
      student_id: feeStudent, payment_date: feeDate, fee_type: feeType,
      fee_for_month: feeType === 'Monthly Fee' ? Number(feeMonth) : null,
      fee_for_year: feeType === 'Monthly Fee' ? Number(feeYear) : null,
      amount: Number(feeAmount), method: feeMethod || null,
      receipt_no: feeReceipt.trim() || null,
      remarks: [feeType === 'Monthly Fee' ? 'Fee plan: ' + feePlan : 'Enrollment fee', feeRemarks.trim()].filter(Boolean).join(' | ') || null,
      created_by: session.user.id
    };
    const { error: e } = await supabase.from('fee_payments').insert(row);
    if (e) setError(e.message);
    else {
      setNotice('Payment recorded successfully.');
      setFeeAmount(''); setFeeReceipt(''); setFeeRemarks('');
      await loadFees();
    }
    setSaving(false);
  }

  const selectedFeeRows = feeRows.filter(r => r.fee_type === 'Monthly Fee' && r.fee_for_month === Number(feeMonth) && r.fee_for_year === Number(feeYear));
  const feePaidByStudent = selectedFeeRows.reduce((acc, r) => {
    if (r.student_id) acc[r.student_id] = (acc[r.student_id] || 0) + Number(r.amount || 0);
    return acc;
  }, {});
  const selectedAssessments = feeAssessments.filter(a => a.fee_for_month === Number(feeMonth) && a.fee_for_year === Number(feeYear));
  const monthlyExpectedByStudent = {};
  const monthlyPlanByStudent = {};
  const monthlySubjectByStudent = {};
  students.forEach(student => {
    const assessment = selectedAssessments.find(a => a.student_id === student.id);
    const calculated = getMonthlyFeeDefault(student, feeMonth, feeYear, subjectChanges);
    monthlyExpectedByStudent[student.id] = assessment ? Number(assessment.expected_amount) : calculated.amount;
    monthlyPlanByStudent[student.id] = assessment?.fee_plan || calculated.plan;
    monthlySubjectByStudent[student.id] = assessment?.subject_snapshot || calculated.subject;
  });
  const monthlyFeeStats = students.reduce((acc, student) => {
    const expected = monthlyExpectedByStudent[student.id] || 0;
    const paid = feePaidByStudent[student.id] || 0;
    acc.expected += expected; acc.received += paid; acc.due += Math.max(0, expected - paid);
    return acc;
  }, { expected: 0, received: 0, due: 0 });

  const filteredStudents = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return [];
    return students.filter(student => String(student.full_name || '').toLowerCase().includes(query));
  }, [students, search]);

  const stats = useMemo(() => {
    const countedStudents = students.filter(s => !s.exclude_from_subject_totals);
    return {
      total: students.length,
      active: students.filter(s => s.current_status === 'Active').length,
      onHold: students.filter(s => s.current_status === 'On Hold').length,
      discontinued: students.filter(s => s.current_status === 'Discontinued').length,
      math: countedStudents.filter(s => s.subject === 'Math' || s.subject === 'Both').length,
      english: countedStudents.filter(s => s.subject === 'English' || s.subject === 'Both').length,
      both: countedStudents.filter(s => s.subject === 'Both').length,
      totalSubjects: countedStudents.reduce((total, s) => total + (s.subject === 'Both' ? 2 : (s.subject === 'Math' || s.subject === 'English' ? 1 : 0)), 0)
    };
  }, [students]);

  const dashboardActiveStudents = students.filter(student => student.current_status === 'Active');
  const dashboardSubjectCount = dashboardActiveStudents
    .filter(student => !student.exclude_from_subject_totals)
    .reduce((total, student) => total + (student.subject === 'Both' ? 2 : (student.subject === 'Math' || student.subject === 'English' ? 1 : 0)), 0);
  const dashboardMonthlyFeeIncome = dashboardIncomeRows.filter(row => row.fee_type === 'Monthly Fee').reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const dashboardEnrollmentFeeIncome = dashboardIncomeRows.filter(row => row.fee_type === 'Enrollment Fee').reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const dashboardMonthlyIncome = dashboardMonthlyFeeIncome + dashboardEnrollmentFeeIncome;
  const dashboardTodayMonthlyFeeIncome = dashboardTodayIncomeRows.filter(row => row.fee_type === 'Monthly Fee').reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const dashboardTodayEnrollmentFeeIncome = dashboardTodayIncomeRows.filter(row => row.fee_type === 'Enrollment Fee').reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const dashboardKumonRoyalty = dashboardRoyaltyRecord?.kumon_amount != null
    ? Number(dashboardRoyaltyRecord.kumon_amount)
    : dashboardMonthlyIncome * dashboardRoyaltyRate;
  const dashboardCenterRevenue = dashboardMonthlyIncome - dashboardKumonRoyalty;
  const dashboardPresentCount = dashboardEmployeeAttendance
    .filter(row => String(row.attendance_status || '').toLowerCase() === 'present').length;
  const dashboardLeaveCount = dashboardEmployeeAttendance
    .filter(row => ['leave', 'on leave'].includes(String(row.attendance_status || '').toLowerCase())).length;

  async function openStudentProfile(student) {
    setSelectedProfile(student);
    setProfileTab('Overview');
    setProfileHistory([]);
    setProfileAttendance([]);
    setProfileLoading(true);
    setError('');
    const [historyResult, attendanceResult] = await Promise.all([
      supabase.from('student_history')
        .select('id, event_date, event_type, subject, previous_level, new_level, test_level, test_result, previous_class_days, new_class_days, previous_class_time, new_class_time, previous_status, new_status, discontinued_reason_or_transfer_centre, remarks')
        .eq('student_id', student.id).order('event_date', { ascending: false }).limit(1000),
      supabase.from('student_attendance')
        .select('id, class_date, attendance, remarks')
        .eq('student_id', student.id).order('class_date', { ascending: false }).limit(1000)
    ]);
    if (historyResult.error) setError('Could not load student profile history: ' + historyResult.error.message);
    else setProfileHistory(historyResult.data || []);
    if (attendanceResult.error) setError('Could not load student attendance: ' + attendanceResult.error.message);
    else setProfileAttendance(attendanceResult.data || []);
    setProfileLoading(false);
  }

  async function login(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
    if (loginError) setError(loginError.message);
    setLoading(false);
  }

  function openNewStudent() {
    setEditingId(null);
    setForm(emptyStudent);
    setShowForm(true);
    setError('');
    setNotice('');
  }

  function openEditStudent(student) {
    setEditingId(student.id);
    setForm({
      ...emptyStudent,
      ...student,
      class_days: student.current_class_days || student.class_days || emptyStudent.class_days,
      class_time: (student.current_class_time || student.class_time || '11:00').slice(0, 5)
    });
    setShowForm(true);
    setError('');
    setNotice('');
  }

  async function saveStudent(event) {
    event.preventDefault();
    if (!isAdmin || saving) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const payload = {
        student_id: (form.student_id || '').trim(),
        full_name: (form.full_name || '').trim(),
        subject: form.subject,
        admission_date: form.admission_date || null,
        class_start_date: form.class_start_date || null,
        stop_billing_from: form.stop_billing_from || null,
        class_days: form.class_days,
        current_class_days: form.class_days,
        class_time: form.class_time || null,
        current_class_time: form.class_time || null,
        current_status: form.current_status,
        enrollment_status: form.current_status,
        no_fee: !!form.no_fee,
        consent_from: form.consent_from || null,
        znzn: form.znzn || null,
        starting_math_level: (form.starting_math_level || '').trim() || null,
        starting_english_level: (form.starting_english_level || '').trim() || null,
        exclude_from_subject_totals: !!form.exclude_from_subject_totals,
        status_effective_date: form.status_effective_date || null,
        school_class: (form.school_class || '').trim() || null,
        medium: form.medium || null,
        remarks: (form.remarks || '').trim() || null
      };
      const result = editingId
        ? await supabase.from('students').update(payload).eq('id', editingId).select('id').maybeSingle()
        : await supabase.from('students').insert(payload).select('id').single();
      if (result.error) throw result.error;
      if (!result.data?.id) throw new Error('No student record was updated. Please refresh the page and try again.');
      setNotice(editingId ? 'Student details updated successfully.' : 'Student added successfully.');
      setShowForm(false);
      if (!editingId) setActiveTab('Students');
      await loadData();
    } catch (err) {
      setError('Could not save student: ' + (err?.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  }

  const filteredEmployees = useMemo(() => employees.filter(employee => {
    const query = employeeSearch.trim().toLowerCase();
    const matchesSearch = !query || [employee.employee_code, employee.full_name, employee.designation, employee.phone]
      .some(value => String(value || '').toLowerCase().includes(query));
    return matchesSearch && (employeeStatusFilter === 'All' || employee.status === employeeStatusFilter);
  }), [employees, employeeSearch, employeeStatusFilter]);

  function openNewEmployee() {
    setEditingEmployeeId(null);
    setEmployeeForm({
      employee_code: '', full_name: '', designation: '', joining_date: '',
      monthly_salary: '', office_start_time: '10:00', office_end_time: '18:00',
      status: 'Active', phone: '', remarks: ''
    });
    setEmployeeFormOpen(true);
    setError('');
    setNotice('');
  }

  function openEditEmployee(employee) {
    setEditingEmployeeId(employee.id);
    setEmployeeForm({
      employee_code: employee.employee_code || '',
      full_name: employee.full_name || '',
      designation: employee.designation || '',
      joining_date: employee.joining_date || '',
      monthly_salary: String(employee.monthly_salary ?? ''),
      office_start_time: (employee.office_start_time || '10:00').slice(0, 5),
      office_end_time: (employee.office_end_time || '18:00').slice(0, 5),
      status: employee.status || 'Active',
      phone: employee.phone || '',
      remarks: employee.remarks || ''
    });
    setEmployeeFormOpen(true);
    setError('');
    setNotice('');
  }

  async function saveEmployee(event) {
    event.preventDefault();
    if (!isAdmin || saving) return;
    const employeeCode = (employeeForm.employee_code || '').trim();
    const fullName = (employeeForm.full_name || '').trim();
    if (!employeeCode || !fullName) {
      setError('Employee ID and Employee Name are required.');
      return;
    }
    if (employeeForm.monthly_salary === '' || Number(employeeForm.monthly_salary) < 0 || !Number.isFinite(Number(employeeForm.monthly_salary))) {
      setError('Enter a valid monthly salary (0 or more).');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const payload = {
        employee_code: employeeCode,
        full_name: fullName,
        designation: (employeeForm.designation || '').trim() || null,
        joining_date: employeeForm.joining_date || null,
        monthly_salary: Number(employeeForm.monthly_salary),
        office_start_time: employeeForm.office_start_time || null,
        office_end_time: employeeForm.office_end_time || null,
        status: employeeForm.status || 'Active',
        phone: (employeeForm.phone || '').trim() || null,
        remarks: (employeeForm.remarks || '').trim() || null
      };
      const result = editingEmployeeId
        ? await supabase.from('employees').update(payload).eq('id', editingEmployeeId).select('id').maybeSingle()
        : await supabase.from('employees').insert(payload).select('id').single();
      if (result.error) throw result.error;
      if (!result.data?.id) throw new Error('No employee record was saved. Please refresh and try again.');
      setNotice(editingEmployeeId ? 'Employee details updated successfully.' : 'Employee added successfully.');
      setEmployeeFormOpen(false);
      setEditingEmployeeId(null);
      await loadData();
    } catch (err) {
      setError('Could not save employee: ' + (err?.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  }

  if (!supabase) return <main className="center"><section className="panel"><div className="brand-mark">BK</div><h1>BRAC Kumon Kallyanpur Center</h1><p>Supabase connection settings are missing from the hosting environment.</p></section></main>;

  if (!session) return <main className="login-page"><form className="login-card" onSubmit={login}>
    <div className="brand-mark">BK</div><p className="eyebrow">BRAC KUMON KALLYANPUR</p>
    <h1>Welcome back</h1><p className="muted">Sign in to your center workspace.</p>
    <label>Email address<input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" required /></label>
    <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required /></label>
    <button className="primary-button" disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button>
    {error && <p className="error-message">{error}</p>}
    <p className="login-foot">Authorized center staff only</p>
  </form></main>;

  return <main className="workspace app-layout">
    <aside className={sidebarOpen ? 'app-sidebar sidebar-open' : 'app-sidebar'}>
      <div className="sidebar-brand"><div className="brand-mark">BK</div><div><strong>BRAC Kumon</strong><span>Kallyanpur Center</span></div></div>
      <p className="sidebar-label">MAIN MENU</p>
      <nav className="sidebar-nav">
        <button type="button" className={activeTab === 'Dashboard' ? 'sidebar-link active' : 'sidebar-link'} onClick={() => {setActiveTab('Dashboard');setSidebarOpen(false);setError('');setNotice('');}}>
          <span className="sidebar-icon">⌂</span><span>Dashboard</span>
        </button>
        <div className="sidebar-menu-group">
          <button type="button" aria-expanded={studentMenuOpen} className={['AddStudent','Students','Fees','Attendance'].includes(activeTab) ? 'sidebar-link active' : 'sidebar-link'} onClick={() => setStudentMenuOpen(v => !v)}>
            <span className="sidebar-icon">▦</span><span>Student</span><span className="sidebar-chevron">{studentMenuOpen ? '⌃' : '⌄'}</span>
          </button>
          {studentMenuOpen && <div className="sidebar-submenu">
            {isAdmin && <button type="button" className={activeTab === 'AddStudent' ? 'sidebar-sublink active' : 'sidebar-sublink'} onClick={() => {setActiveTab('AddStudent');setSidebarOpen(false);openNewStudent();}}><span className="submenu-icon add-student-icon">＋</span><span>Add Student</span></button>}
            <button type="button" className={activeTab === 'Students' ? 'sidebar-sublink active' : 'sidebar-sublink'} onClick={() => {setActiveTab('Students');setSidebarOpen(false);setError('');setNotice('');setSelectedProfile(null);}}><span className="submenu-icon">◎</span><span>Student Profile</span></button>
            {isAdmin && <button type="button" className={activeTab === 'Fees' ? 'sidebar-sublink active' : 'sidebar-sublink'} onClick={() => {setActiveTab('Fees');setSidebarOpen(false);setError('');setNotice('');}}><span className="submenu-icon">৳</span><span>Fees</span></button>}
            <button type="button" className={activeTab === 'Attendance' ? 'sidebar-sublink active' : 'sidebar-sublink'} onClick={() => {setActiveTab('Attendance');setSidebarOpen(false);setError('');setNotice('');}}><span className="submenu-icon">✓</span><span>Attendance</span></button>
          </div>}
        </div>
        <button type="button" className={activeTab === 'History' ? 'sidebar-link active' : 'sidebar-link'} onClick={() => {setActiveTab('History');setSidebarOpen(false);setError('');setNotice('');}}>
          <span className="sidebar-icon">↻</span><span>History</span>
        </button>
        {isAdmin && <button type="button" className={activeTab === 'Employees' ? 'sidebar-link active' : 'sidebar-link'} onClick={() => {setActiveTab('Employees');setSidebarOpen(false);setError('');setNotice('');}}>
          <span className="sidebar-icon">♙</span><span>Employees</span>
        </button>}
      </nav>
      <div className="sidebar-bottom"><span className="sidebar-online-dot"></span> Online workspace</div>
    </aside>
    {sidebarOpen && <button className="sidebar-scrim" aria-label="Close menu" onClick={() => setSidebarOpen(false)} />}
    <div className="app-main">
    <header className="topbar">
      <button type="button" className="mobile-menu-button" aria-label="Open navigation menu" onClick={() => setSidebarOpen(v => !v)}>☰</button>
      <div className="brand-lockup"><div className="brand-mark small">BK</div><div><strong>BRAC Kumon</strong><span>Kallyanpur Center</span></div></div>
      <div className="top-actions"><span className="user-chip">{profile?.full_name || session.user.email} · {isAdmin ? 'Admin' : 'Instructor'}</span><button className="button-light" onClick={() => supabase.auth.signOut()}>Sign out</button></div>
    </header>

    {activeTab === 'Dashboard' && <section className="page-heading"><div><p className="eyebrow">CENTER MANAGEMENT</p><h1>Dashboard</h1><p className="muted">Student records and center operations in one place.</p></div><span className="live-indicator">Online database</span></section>}

    {error && <div className="alert error-box">{error}</div>}
    {notice && <div className="alert success-box">{notice}</div>}


    {activeTab === 'Dashboard' && <section className="dashboard-overview">
      <div className="dashboard-clock-bar"><span className="dashboard-clock-date">{dashboardDateLabel}</span><strong className="dashboard-clock">{dashboardTimeLabel}</strong></div>
      <div className="dashboard-section-title"><div><p className="eyebrow">STUDENT DATA</p><h2>Student Overview</h2></div></div>
      <div className="stat-grid dashboard-stats">
        <article className="stat-card"><span>Active Students</span><strong>{dashboardActiveStudents.length}</strong><small>Currently enrolled</small></article>
        <article className="stat-card"><span>Total Subject Count</span><strong>{dashboardSubjectCount}</strong><small>Active Math + English enrollments</small></article>
      </div>

      {isAdmin && <>
        <div className="dashboard-section-title"><div><p className="eyebrow">FINANCIAL UPDATE</p><h2>Financial Overview</h2></div></div>
        <div className="stat-grid dashboard-stats dashboard-financial-stats">
          <article className="stat-card"><span>Kumon Royalty</span><strong>৳{money(dashboardKumonRoyalty)}</strong><small>{dashboardRoyaltyRecord?.kumon_amount != null ? 'Kumon amount entered' : 'Estimated at ' + Math.round(dashboardRoyaltyRate * 100) + '%'}</small></article>
          <article className="stat-card"><span>Center Revenue</span><strong>৳{money(dashboardCenterRevenue)}</strong><small>Monthly income minus Kumon Royalty</small></article>
        </div>

        <div className="dashboard-section-title"><div><p className="eyebrow">TODAY INCOME</p><h2>Income Summary</h2></div></div>
        <div className="stat-grid dashboard-stats dashboard-today-income">
          <article className="stat-card"><span>Monthly Fee</span><strong>৳{money(dashboardTodayMonthlyFeeIncome)}</strong><small>Received today</small></article>
          <article className="stat-card"><span>Enrollment Fee</span><strong>৳{money(dashboardTodayEnrollmentFeeIncome)}</strong><small>Received today</small></article>
        </div>

        <div className="dashboard-section-title"><div><p className="eyebrow">EMPLOYEE</p><h2>Employee Attendance</h2></div></div>
        <div className="stat-grid dashboard-stats">
          <article className="stat-card"><span>Present</span><strong>{dashboardPresentCount}</strong><small>Active employees</small></article>
          <article className="stat-card"><span>On Leave</span><strong>{dashboardLeaveCount}</strong><small>Active employees</small></article>
        </div>
        {dashboardDataLoading && <p className="muted dashboard-loading">Updating dashboard figures…</p>}
      </>}
    </section>}


    {activeTab === 'Students' && <section className="content-card">
      <div className="section-heading"><div><p className="eyebrow">STUDENT MANAGEMENT</p><h2>Student Profile</h2><p className="muted">Search by student name to view an individual student’s details.</p></div></div>
      <div className="student-profile-search">
        <input className="search-input" placeholder="Type student name to search…" value={search} onChange={e => {setSearch(e.target.value);setSelectedProfile(null);setProfileHistory([]);setProfileAttendance([]);}} />
      </div>
      {!selectedProfile && !search.trim() && <div className="empty-state"><strong>Search for a student</strong><span>Enter the student’s name above. Only matching students will appear.</span></div>}
      {!selectedProfile && search.trim() && <div className="student-search-results">
        {filteredStudents.map(student => <div className="student-search-result" key={student.id}>
          <div><strong>{student.full_name}</strong><small>{student.student_id} · {student.subject}</small></div>
          <button type="button" className="primary-button compact" onClick={() => openStudentProfile(student)}>View details</button>
        </div>)}
        {!loading && filteredStudents.length === 0 && <div className="empty-state">No student found with that name.</div>}
      </div>}
      {loading && <div className="empty-state">Loading student records…</div>}
    </section>}

    {selectedProfile && activeTab === 'Students' && <section className="content-card student-profile-card">
      <div className="section-heading"><div><p className="eyebrow">STUDENT PROFILE</p><h2>{selectedProfile.full_name}</h2><p className="muted">Student ID: {selectedProfile.student_id} · {selectedProfile.subject}</p></div><button className="button-light compact" onClick={() => setSelectedProfile(null)}>Back to directory</button></div>
      <div className="profile-tabs">{['Overview','Class Schedule','Learning Progress','Achievement Test','Attendance'].map(tab => <button type="button" key={tab} className={profileTab === tab ? 'tab-button active' : 'tab-button'} onClick={() => setProfileTab(tab)}>{tab}</button>)}</div>
      {profileLoading && <div className="empty-state">Loading student history…</div>}
      {!profileLoading && profileTab === 'Overview' && <div className="profile-detail-grid">
        {[
          ['Student ID', selectedProfile.student_id], ['Student Name', selectedProfile.full_name], ['Subject at Enrollment', selectedProfile.subject],
          ['Admission Date', selectedProfile.admission_date], ['Class Start Date', selectedProfile.class_start_date], ['School Class', selectedProfile.school_class],
          ['Medium', selectedProfile.medium], ['Consent From', selectedProfile.consent_from], ['ZnZn', selectedProfile.znzn]
        ].map(([label,value]) => <div className="profile-detail" key={label}><small>{label}</small><strong>{value || '—'}</strong></div>)}
      </div>}
      {!profileLoading && profileTab === 'Class Schedule' && <div className="profile-detail-grid">
        <div className="profile-detail"><small>Class Days</small><strong>{selectedProfile.current_class_days || selectedProfile.class_days || '—'}</strong></div>
        <div className="profile-detail"><small>Class Time</small><strong>{formatClassTime(selectedProfile.current_class_time || selectedProfile.class_time) || '—'}</strong></div>
        <div className="profile-detail"><small>Class Start Date</small><strong>{selectedProfile.class_start_date || '—'}</strong></div>
        <div className="profile-detail"><small>School Class</small><strong>{selectedProfile.school_class || '—'}</strong></div>
        <div className="profile-detail"><small>Medium</small><strong>{selectedProfile.medium || '—'}</strong></div>
      </div>}
      {!profileLoading && profileTab === 'Learning Progress' && <div className="profile-detail-grid">
        <div className="profile-detail"><small>Math Starting Level</small><strong>{selectedProfile.starting_math_level || '—'}</strong></div>
        <div className="profile-detail"><small>Math Current Level</small><strong>{[...profileHistory].filter(x => x.event_type === 'Level Change' && x.subject === 'Math' && x.new_level).sort((a,b)=>String(b.event_date).localeCompare(String(a.event_date)))[0]?.new_level || selectedProfile.starting_math_level || '—'}</strong></div>
        <div className="profile-detail"><small>English Starting Level</small><strong>{selectedProfile.starting_english_level || '—'}</strong></div>
        <div className="profile-detail"><small>English Current Level</small><strong>{[...profileHistory].filter(x => x.event_type === 'Level Change' && x.subject === 'English' && x.new_level).sort((a,b)=>String(b.event_date).localeCompare(String(a.event_date)))[0]?.new_level || selectedProfile.starting_english_level || '—'}</strong></div>
        <div className="profile-detail"><small>Math Level Changes</small><strong>{profileHistory.filter(x => x.event_type === 'Level Change' && x.subject === 'Math').length}</strong></div>
        <div className="profile-detail"><small>English Level Changes</small><strong>{profileHistory.filter(x => x.event_type === 'Level Change' && x.subject === 'English').length}</strong></div>
      </div>}
      {!profileLoading && profileTab === 'Achievement Test' && <div className="table-wrap"><table><thead><tr><th>Test Date</th><th>Subject</th><th>Test Level</th><th>Result</th><th>Remarks</th></tr></thead><tbody>
        {profileHistory.filter(x => x.event_type === 'Achievement Test').map(x => <tr key={x.id}><td>{x.event_date}</td><td>{x.subject || '—'}</td><td>{x.test_level || '—'}</td><td>{x.test_result || '—'}</td><td>{x.remarks || '—'}</td></tr>)}
      </tbody></table>{!profileHistory.some(x => x.event_type === 'Achievement Test') && <div className="empty-state">No achievement tests recorded.</div>}</div>}
      {!profileLoading && profileTab === 'Attendance' && <>
        <div className="stat-grid fee-stats">
          <article className="stat-card"><span>Present</span><strong>{profileAttendance.filter(x => x.attendance === 'Present').length}</strong></article>
          <article className="stat-card"><span>Absent</span><strong>{profileAttendance.filter(x => x.attendance === 'Absent').length}</strong></article>
          <article className="stat-card"><span>Leave</span><strong>{profileAttendance.filter(x => x.attendance === 'Leave').length}</strong></article>
        </div>
        <div className="table-wrap"><table><thead><tr><th>Class Date</th><th>Attendance</th><th>Remarks</th></tr></thead><tbody>
          {profileAttendance.map(x => <tr key={x.id}><td>{x.class_date}</td><td>{x.attendance}</td><td>{x.remarks || '—'}</td></tr>)}
        </tbody></table>{!profileAttendance.length && <div className="empty-state">No attendance records found.</div>}</div>
      </>}

      {isAdmin && <div className="section-actions"><button className="primary-button compact" onClick={() => openEditStudent(selectedProfile)}>Edit student details</button></div>}
    </section>}

    {activeTab === 'Attendance' && <section className="content-card">
      <div className="section-heading"><div><p className="eyebrow">CLASSROOM</p><h2>Student attendance</h2><p className="muted">Daily attendance register.</p></div></div>
      {isAdmin && <form className="inline-entry-form" onSubmit={saveAttendance}>
        <label>Date<input type="date" value={attendanceDate} onChange={e => setAttendanceDate(e.target.value)} required /></label>
        <label>Student<select value={attendanceStudent} onChange={e => setAttendanceStudent(e.target.value)} required><option value="">Select student</option>{students.map(s => <option key={s.id} value={s.id}>{s.student_id} — {s.full_name}</option>)}</select></label>
        <label>Attendance<select value={attendanceValue} onChange={e => setAttendanceValue(e.target.value)}><option>Present</option><option>Absent</option><option>Leave</option></select></label>
        <label>Remarks<input value={entryRemarks} onChange={e => setEntryRemarks(e.target.value)} /></label>
        <button className="primary-button" disabled={saving}>{saving ? 'Saving…' : 'Save attendance'}</button>
      </form>}
      <div className="table-wrap"><table><thead><tr><th>Date</th><th>Student ID</th><th>Name</th><th>Status</th><th>Remarks</th></tr></thead><tbody>
        {attendanceRows.map(r => <tr key={r.id}><td>{r.class_date}</td><td>{r.students?.student_id || '—'}</td><td>{r.students?.full_name || '—'}</td><td>{r.attendance}</td><td>{r.remarks || '—'}</td></tr>)}
      </tbody></table>{!attendanceRows.length && <div className="empty-state">No attendance records found.</div>}</div>
    </section>}

    {activeTab === 'History' && <section className="content-card">
      <div className="section-heading"><div><p className="eyebrow">STUDENT PROGRESS</p><h2>Student history</h2><p className="muted">Add events without replacing previous history.</p></div></div>
      {isAdmin && <form className="inline-entry-form" onSubmit={saveHistory}>
        <label>Student<select value={historyStudent} onChange={e => setHistoryStudent(e.target.value)} required><option value="">Select student</option>{students.map(s => <option key={s.id} value={s.id}>{s.student_id} — {s.full_name}</option>)}</select></label>
        <label>Date<input type="date" value={historyDate} onChange={e => setHistoryDate(e.target.value)} required /></label>
        <label>Event<select value={historyType} onChange={e => {setHistoryType(e.target.value);setHistoryPrevious('');setHistoryNew('');}}>{['Level Change','Achievement Test','Schedule Change','Status Change','Transfer In','Transfer Out'].map(x => <option key={x}>{x}</option>)}</select></label>
        <label>Subject<select value={historySubject} onChange={e => setHistorySubject(e.target.value)}><option>Math</option><option>English</option><option>Both</option></select></label>
        <label>Previous / test level<input value={historyPrevious} onChange={e => setHistoryPrevious(e.target.value)} /></label>
        <label>New level / result / details<input value={historyNew} onChange={e => setHistoryNew(e.target.value)} /></label>
        <label>Remarks<input value={entryRemarks} onChange={e => setEntryRemarks(e.target.value)} /></label>
        <button className="primary-button" disabled={saving}>{saving ? 'Saving…' : 'Add history event'}</button>
      </form>}
      <div className="table-wrap"><table><thead><tr><th>Date</th><th>Student ID</th><th>Name</th><th>Event</th><th>Subject</th><th>Details</th><th>Remarks</th></tr></thead><tbody>
        {historyRows.map(r => <tr key={r.id}><td>{r.event_date}</td><td>{r.students?.student_id || '—'}</td><td>{r.students?.full_name || '—'}</td><td>{r.event_type}</td><td>{r.subject || '—'}</td><td>{r.previous_level || r.test_level || r.previous_class_days || r.previous_status || ''}{r.new_level || r.test_result || r.new_class_days || r.new_status ? ' → ' + (r.new_level || r.test_result || r.new_class_days || r.new_status) : ''}</td><td>{r.remarks || '—'}</td></tr>)}
      </tbody></table>{!historyRows.length && <div className="empty-state">No history events found.</div>}</div>
    </section>}


    {activeTab === 'Employees' && isAdmin && <section className="content-card">
      <div className="section-heading">
        <div><p className="eyebrow">TEAM MANAGEMENT</p><h2>Employee directory</h2><p className="muted">Manage employee master records, office schedule and monthly salary.</p></div>
        <div className="section-actions"><button className="primary-button compact" onClick={openNewEmployee}>+ Add employee</button></div>
      </div>
      <div className="filters">
        <input className="search-input" placeholder="Search by Employee ID, name, designation or phone…" value={employeeSearch} onChange={e => setEmployeeSearch(e.target.value)} />
        <select value={employeeStatusFilter} onChange={e => setEmployeeStatusFilter(e.target.value)}><option>All</option><option>Active</option><option>Inactive</option></select>
      </div>
      {employeeFormOpen && <form className="inline-entry-form employee-entry-form" onSubmit={saveEmployee}>
        <label>Employee ID<input value={employeeForm.employee_code} onChange={e => setEmployeeForm(v => ({...v, employee_code:e.target.value}))} placeholder="EMP-001" required /></label>
        <label>Employee Name<input value={employeeForm.full_name} onChange={e => setEmployeeForm(v => ({...v, full_name:e.target.value}))} required /></label>
        <label>Designation<input value={employeeForm.designation} onChange={e => setEmployeeForm(v => ({...v, designation:e.target.value}))} /></label>
        <label>Joining Date<input type="date" value={employeeForm.joining_date} onChange={e => setEmployeeForm(v => ({...v, joining_date:e.target.value}))} /></label>
        <label>Monthly Salary (৳)<input type="number" min="0" step="0.01" value={employeeForm.monthly_salary} onChange={e => setEmployeeForm(v => ({...v, monthly_salary:e.target.value}))} required /></label>
        <label>Office In Time<input type="time" value={employeeForm.office_start_time} onChange={e => setEmployeeForm(v => ({...v, office_start_time:e.target.value}))} /></label>
        <label>Office Out Time<input type="time" value={employeeForm.office_end_time} onChange={e => setEmployeeForm(v => ({...v, office_end_time:e.target.value}))} /></label>
        <label>Employee Status<select value={employeeForm.status} onChange={e => setEmployeeForm(v => ({...v, status:e.target.value}))}><option>Active</option><option>Inactive</option></select></label>
        <label>Phone<input type="tel" value={employeeForm.phone} onChange={e => setEmployeeForm(v => ({...v, phone:e.target.value}))} /></label>
        <label className="full-width">Remarks<input value={employeeForm.remarks} onChange={e => setEmployeeForm(v => ({...v, remarks:e.target.value}))} /></label>
        <div className="employee-form-actions"><button type="button" className="button-light" onClick={() => {setEmployeeFormOpen(false);setEditingEmployeeId(null);}}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? 'Saving…' : editingEmployeeId ? 'Update employee' : 'Save employee'}</button></div>
      </form>}
      <div className="table-wrap"><table><thead><tr><th>Employee ID</th><th>Employee Name</th><th>Designation</th><th>Joining Date</th><th>Office Time</th><th>Monthly Salary</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>{filteredEmployees.map(employee => <tr key={employee.id}>
          <td className="id-cell">{employee.employee_code || '—'}</td><td><strong>{employee.full_name}</strong><small className="mobile-sub">{employee.phone || ''}</small></td><td>{employee.designation || '—'}</td><td>{employee.joining_date || '—'}</td>
          <td>{employee.office_start_time ? formatClassTime(employee.office_start_time) : '—'} – {employee.office_end_time ? formatClassTime(employee.office_end_time) : '—'}</td>
          <td>৳{money(employee.monthly_salary)}</td><td><span className={'status-pill ' + (employee.status === 'Active' ? 'active' : 'discontinued')}>{employee.status || 'Active'}</span></td>
          <td><button className="text-button" onClick={() => openEditEmployee(employee)}>Edit</button></td>
        </tr>)}</tbody></table>
        {!loading && filteredEmployees.length === 0 && <div className="empty-state"><strong>No employee records found</strong><span>{employees.length ? 'Try changing your search or status filter.' : 'Add your first employee to get started.'}</span></div>}
        {loading && <div className="empty-state">Loading employee records…</div>}
      </div>
      <div className="table-footer">Showing {filteredEmployees.length} of {employees.length} employees. Inactive employees remain saved for historical attendance and salary records.</div>
    </section>}

    {activeTab === 'Fees' && isAdmin && <section className="content-card">
      <div className="section-heading"><div><p className="eyebrow">PAYMENT MANAGEMENT</p><h2>Monthly fee management</h2><p className="muted">Record full or partial payments. Payment date and fee month are stored separately.</p></div></div>
      <div className="fee-period"><label>Fee month<select value={feeMonth} onChange={e => {setFeeMonth(e.target.value);applyFeeDefaults(feeStudent,e.target.value,feeYear);}}>{Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{new Date(2000,i,1).toLocaleString('en',{month:'long'})}</option>)}</select></label><label>Year<input type="number" value={feeYear} onChange={e => {setFeeYear(e.target.value);if(e.target.value)applyFeeDefaults(feeStudent,feeMonth,e.target.value);}} /></label></div>
      <div className="stat-grid fee-stats">
        <article className="stat-card"><span>Expected monthly fee</span><strong>৳{money(monthlyFeeStats.expected)}</strong></article>
        <article className="stat-card"><span>Received</span><strong>৳{money(monthlyFeeStats.received)}</strong></article>
        <article className="stat-card"><span>Outstanding</span><strong>৳{money(monthlyFeeStats.due)}</strong></article>
      </div>
      <form className="inline-entry-form" onSubmit={saveFee}>
        <label>Student<select value={feeStudent} onChange={e => { const id=e.target.value; setFeeStudent(id); if(feeType==='Monthly Fee') applyFeeDefaults(id); else setFeeAmount('1575'); }} required><option value="">Select student</option>{students.map(s=><option key={s.id} value={s.id}>{s.student_id} — {s.full_name}</option>)}</select></label>
        <label>Fee type<select value={feeType} onChange={e => { const v=e.target.value; setFeeType(v); if(v==='Enrollment Fee') { setFeeExpected(''); setFeeAmount('1575'); } else { applyFeeDefaults(feeStudent); } }}><option>Monthly Fee</option><option>Enrollment Fee</option></select></label>
        {feeType === 'Monthly Fee' ? <><label>Fee plan<select value={feePlan} onChange={e => { const p=e.target.value; setFeePlan(p); const s=students.find(x=>x.id===feeStudent); const calculated=s?getMonthlyFeeDefault(s,feeMonth,feeYear,subjectChanges):null; setFeeExpected(p==='Full Month'?(calculated?.subject==='Both'?'5400':'3000'):p==='Half Month'?(calculated?.subject==='Both'?'2955':'1650'):''); }}><option>Full Month</option><option>Half Month</option><option>Custom</option></select></label><label>Expected monthly fee (৳)<input type="number" min="0" step="0.01" value={feeExpected} onChange={e=>{setFeeExpected(e.target.value);setFeePlan('Custom');}} required /></label></> : <label>Enrollment fee amount<select value={feeAmount} onChange={e=>setFeeAmount(e.target.value)}><option value="1575">৳1,575 — Discount</option><option value="3300">৳3,300 — Without discount</option></select></label>}
        <label>Payment date<input type="date" value={feeDate} onChange={e => setFeeDate(e.target.value)} required /></label>
        {feeType === 'Monthly Fee' && <><label>Fee for month<select value={feeMonth} onChange={e => {setFeeMonth(e.target.value);applyFeeDefaults(feeStudent,e.target.value,feeYear);}}>{Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{new Date(2000,i,1).toLocaleString('en',{month:'long'})}</option>)}</select></label><label>Fee for year<input type="number" value={feeYear} onChange={e => {setFeeYear(e.target.value);applyFeeDefaults(feeStudent,feeMonth,e.target.value);}} required /></label></>}
        <label>Payment amount (৳)<input type="number" min="1" step="0.01" value={feeAmount} onChange={e => setFeeAmount(e.target.value)} required /></label>
        <label>Payment method<select value={feeMethod} onChange={e => setFeeMethod(e.target.value)}><option>Cash</option><option>Bank</option><option>bKash</option><option>Nagad</option><option>Other</option></select></label>
        <label>Receipt number<input value={feeReceipt} onChange={e => setFeeReceipt(e.target.value)} /></label>
        <label>Remarks<input value={feeRemarks} onChange={e => setFeeRemarks(e.target.value)} /></label>
        {feeType === 'Monthly Fee' && <button type="button" className="button-light" disabled={saving || !feeStudent || !(Number(feeExpected) > 0)} onClick={saveFeeAssessment}>Save fee plan</button>}
        <button className="primary-button" disabled={saving}>{saving ? 'Saving…' : 'Record payment'}</button>
      </form>
      <h3>Monthly payment status</h3>
      <div className="table-wrap"><table><thead><tr><th>Student ID</th><th>Student name</th><th>Subject</th><th>Fee plan</th><th>Expected</th><th>Received</th><th>Due</th><th>Status</th></tr></thead><tbody>
        {students.map(s=>{const expected=monthlyExpectedByStudent[s.id]||0;const paid=feePaidByStudent[s.id]||0;const plan=monthlyPlanByStudent[s.id];const status=expected===0&&paid>0?'Check':plan==='Exempt'?'Exempt':plan==='No Fee'?'No fee':paid>=expected?'Paid':paid>0?'Partial':'Unpaid';return <tr key={s.id}><td>{s.student_id}</td><td>{s.full_name}</td><td>{monthlySubjectByStudent[s.id]||s.subject}</td><td>{plan}</td><td>৳{money(expected)}</td><td>৳{money(paid)}</td><td>৳{money(Math.max(0,expected-paid))}</td><td>{status}</td></tr>;})}
      </tbody></table></div>
      <h3>Payment history</h3>
      <div className="table-wrap"><table><thead><tr><th>Payment date</th><th>Student ID</th><th>Name</th><th>Fee type</th><th>Fee month</th><th>Amount</th><th>Method</th><th>Receipt</th></tr></thead><tbody>
        {feeRows.map(r=><tr key={r.id}><td>{r.payment_date}</td><td>{r.students?.student_id||'—'}</td><td>{r.students?.full_name||'—'}</td><td>{r.fee_type}</td><td>{r.fee_for_month?new Date(2000,r.fee_for_month-1,1).toLocaleString('en',{month:'short'})+' '+r.fee_for_year:'—'}</td><td>৳{money(r.amount)}</td><td>{r.method||'—'}</td><td>{r.receipt_no||'—'}</td></tr>)}
      </tbody></table>{!feeRows.length && <div className="empty-state">No payment records found.</div>}</div>
      <p className="muted fee-note">Expected fees follow the workbook rules: class start date determines the first month's half/full rate; subject changes apply from their charged-from month; No Fee? students are exempt; stop-billing dates end charges from that month. The expected monthly amount is saved separately from each payment, so partial payments do not change the monthly due. Custom amounts are saved as a month-specific assessment.</p>
    </section>}
    {showForm && isAdmin && <div className="modal-backdrop" role="presentation"><form className="student-modal" onSubmit={saveStudent}>
      <div className="modal-heading"><div><p className="eyebrow">STUDENT RECORD</p><h2>{editingId ? 'Edit student' : 'Add student'}</h2></div><button type="button" className="close-button" onClick={() => {setShowForm(false);if(activeTab === 'AddStudent') setActiveTab('Students');}}>×</button></div>
      <div className="form-grid">
        <label>Student ID<input value={form.student_id} onChange={e => setForm({...form, student_id:e.target.value})} required disabled={!!editingId} /></label>
        <label>Student name<input value={form.full_name} onChange={e => setForm({...form, full_name:e.target.value})} required /></label>
        <label>Subject<select value={form.subject} onChange={e => setForm({...form, subject:e.target.value})}><option>Math</option><option>English</option><option>Both</option></select></label>
        <label>Status<select value={form.current_status} onChange={e => setForm({...form, current_status:e.target.value})}><option>Active</option><option>On Hold</option><option>Discontinued</option></select></label>
        <label>No fee (exempt)<input type="checkbox" checked={!!form.no_fee} onChange={e => setForm({...form, no_fee:e.target.checked})} /></label>
        <label>Consent From<select value={form.consent_from || 'No'} onChange={e => setForm({...form, consent_from:e.target.value})}><option>Yes</option><option>No</option></select></label>
        <label>ZnZn<select value={form.znzn || 'No'} onChange={e => setForm({...form, znzn:e.target.value})}><option>Yes</option><option>No</option></select></label>
        <label>Math Starting Level<input value={form.starting_math_level || ''} onChange={e => setForm({...form, starting_math_level:e.target.value})} /></label>
        <label>English Starting Level<input value={form.starting_english_level || ''} onChange={e => setForm({...form, starting_english_level:e.target.value})} /></label>
        <label>Not counted in subject totals<input type="checkbox" checked={!!form.exclude_from_subject_totals} onChange={e => setForm({...form, exclude_from_subject_totals:e.target.checked})} /></label>
        <label>Admission date<input type="date" value={form.admission_date || ''} onChange={e => setForm({...form, admission_date:e.target.value})} /></label>
        <label>Class start date<input type="date" value={form.class_start_date || ''} onChange={e => setForm({...form, class_start_date:e.target.value})} /></label>
        <label>Stop billing from<input type="date" value={form.stop_billing_from || ''} onChange={e => setForm({...form, stop_billing_from:e.target.value})} /></label>
        <label>Status effective date<input type="date" value={form.status_effective_date || ''} onChange={e => setForm({...form, status_effective_date:e.target.value})} /></label>
        <label>Class days<select value={form.class_days} onChange={e => setForm({...form, class_days:e.target.value})}><option>Saturday & Tuesday</option><option>Sunday & Wednesday</option></select></label>
        <label>Class time<select value={form.class_time} onChange={e => setForm({...form, class_time:e.target.value})}>{times.map(time => <option key={time} value={time}>{formatClassTime(time)}</option>)}</select></label>
        <label>School class<input value={form.school_class || ''} onChange={e => setForm({...form, school_class:e.target.value})} /></label>
        <label>Medium<select value={form.medium || ''} onChange={e => setForm({...form, medium:e.target.value})}><option value="">Select</option><option>Bangla</option><option>English</option><option>English Version</option></select></label>
        <label className="full-width">Remarks<textarea rows="3" value={form.remarks || ''} onChange={e => setForm({...form, remarks:e.target.value})} /></label>
      </div>
      {error && <p className="error-message">{error}</p>}
      <div className="modal-actions"><button type="button" className="button-light" onClick={() => {setShowForm(false);if(activeTab === 'AddStudent') setActiveTab('Students');}}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? 'Saving…' : 'Save student'}</button></div>
    </form></div>}
    <footer className="app-footer">BRAC Kumon Kallyanpur Center <span>·</span> Secure online workspace</footer>
    </div>
  </main>;
}

createRoot(document.getElementById('root')).render(<App/>);
