import { useState, useEffect } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import axios from "axios";
import "../styles/Auth.css";

const MailIcon = () => (
    <svg className="field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="M22 7l-10 6L2 7" />
    </svg>
);

const LockIcon = () => (
    <svg className="field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
);

const UserIcon = () => (
    <svg className="field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
    </svg>
);

const PhoneIcon = () => (
    <svg className="field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
);

const EyeIcon = ({ off: isOff }) => isOff ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
        <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
    </svg>
);

const ArrowLeftIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="19" y1="12" x2="5" y2="12" />
        <polyline points="12 19 5 12 12 5" />
    </svg>
);

const AlertIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
);

const ShieldIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="M9 12l2 2 4-4" />
    </svg>
);

const EmployeeIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
);

const ChartIcon = () => (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
);

const CheckIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
    </svg>
);

export default function Signup() {
    const { role } = useParams();
    const nav = useNavigate();
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [phone, setPhone] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const isAdmin = role === "admin";
    const loginPath = isAdmin ? "/admin-login" : "/login";

    // Password strength
    const pwStrength = (() => {
        if (!password) return { level: 0, label: "", color: "" };
        let score = 0;
        if (password.length >= 6) score++;
        if (password.length >= 10) score++;
        if (/[A-Z]/.test(password)) score++;
        if (/[0-9]/.test(password)) score++;
        if (/[^A-Za-z0-9]/.test(password)) score++;
        if (score <= 1) return { level: 1, label: "Weak", color: "#f85149" };
        if (score <= 2) return { level: 2, label: "Fair", color: "#d29922" };
        if (score <= 3) return { level: 3, label: "Good", color: "#58a6ff" };
        return { level: 4, label: "Strong", color: "#3fb950" };
    })();

    const signup = async () => {
        if (!firstName.trim() || !lastName.trim()) {
            setError("First name and last name are required");
            return;
        }
        if (!email) {
            setError("Email is required");
            return;
        }
        if (!password || password.length < 6) {
            setError("Password must be at least 6 characters");
            return;
        }
        if (phone && !/^\+?[\d\s-]{7,15}$/.test(phone)) {
            setError("Please enter a valid phone number");
            return;
        }

        setError("");
        setLoading(true);
        try {
            const res = await axios.post("http://localhost:5000/api/auth/signup", {
                firstName: firstName.trim(),
                lastName: lastName.trim(),
                phone: phone.trim() || undefined,
                email,
                password,
                role: isAdmin ? "admin" : "employee",
            });

            if (res.data.role === "admin") {
                localStorage.setItem("token", res.data.token);
                localStorage.setItem("role", res.data.role);
                localStorage.setItem("userName", res.data.name || `${firstName} ${lastName}`);
                nav("/admin");
            } else {
                nav("/login", { 
                    state: { 
                        pendingApproval: true, 
                        message: "Your account has been created but requires admin approval. You will be notified once your account is activated." 
                    } 
                });
            }
        } catch (err) {
            setError(err.response?.data?.message || "Signup failed. Please try again.");
            setLoading(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === "Enter") signup();
    };

    return (
        <div className="auth-wrapper">
            <div className="orb-1" />
            <div className="orb-2" />
            <div className="orb-3" />

            <div className="auth-card">
                <Link to="/" className="auth-back-link">
                    <ArrowLeftIcon /> Back to role selection
                </Link>

                <div className="auth-brand">
                    <div className="brand-icon">
                        <ChartIcon />
                    </div>
                    <h1>Create Account</h1>
                    <p className="auth-subtitle">
                        {isAdmin ? "Set up your administrator account" : "Join as an employee to explore your data"}
                    </p>
                    <div className={`auth-role-badge ${isAdmin ? "admin" : "user"}`}>
                        {isAdmin ? <ShieldIcon /> : <EmployeeIcon />}
                        {isAdmin ? "Admin" : "Employee"} Account
                    </div>
                </div>

                <div className="auth-form" onKeyDown={handleKeyDown}>
                    {error && (
                        <div className="auth-error">
                            <AlertIcon />
                            {error}
                        </div>
                    )}

                    {/* Name Row */}
                    <div style={{ display: "flex", gap: "10px" }}>
                        <div className="auth-field" style={{ flex: 1 }}>
                            <UserIcon />
                            <input
                                type="text"
                                placeholder="First Name"
                                value={firstName}
                                onChange={e => setFirstName(e.target.value)}
                                autoComplete="given-name"
                            />
                        </div>
                        <div className="auth-field" style={{ flex: 1 }}>
                            <UserIcon />
                            <input
                                type="text"
                                placeholder="Last Name"
                                value={lastName}
                                onChange={e => setLastName(e.target.value)}
                                autoComplete="family-name"
                            />
                        </div>
                    </div>

                    {/* Phone */}
                    <div className="auth-field">
                        <PhoneIcon />
                        <input
                            type="tel"
                            placeholder="Phone Number (optional)"
                            value={phone}
                            onChange={e => setPhone(e.target.value)}
                            autoComplete="tel"
                        />
                    </div>

                    {/* Email */}
                    <div className="auth-field">
                        <MailIcon />
                        <input
                            type="email"
                            placeholder="you@company.com"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            autoComplete="email"
                        />
                    </div>

                    {/* Password */}
                    <div className="auth-field">
                        <LockIcon />
                        <input
                            type={showPassword ? "text" : "password"}
                            placeholder="Create a password (min 6 chars)"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            autoComplete="new-password"
                        />
                        <button
                            type="button"
                            className="password-toggle"
                            onClick={() => setShowPassword(!showPassword)}
                        >
                            <EyeIcon off={showPassword} />
                        </button>
                    </div>

                    {/* Password Strength Indicator */}
                    {password && (
                        <div style={{ marginTop: "-6px", marginBottom: "4px" }}>
                            <div style={{ display: "flex", gap: "4px", marginBottom: "4px" }}>
                                {[1, 2, 3, 4].map(i => (
                                    <div key={i} style={{
                                        flex: 1, height: "3px", borderRadius: "2px",
                                        background: i <= pwStrength.level ? pwStrength.color : "rgba(255,255,255,0.08)",
                                        transition: "all 0.3s ease",
                                    }} />
                                ))}
                            </div>
                            <div style={{
                                display: "flex", justifyContent: "space-between", alignItems: "center",
                                fontSize: "10px", fontFamily: "'DM Mono', monospace",
                            }}>
                                <span style={{ color: pwStrength.color }}>{pwStrength.label}</span>
                                <div style={{ display: "flex", gap: "8px", color: "rgba(139,148,158,0.6)" }}>
                                    <span style={{ color: password.length >= 6 ? "#3fb950" : undefined }}>
                                        {password.length >= 6 && <CheckIcon />} 6+ chars
                                    </span>
                                    <span style={{ color: /[A-Z]/.test(password) ? "#3fb950" : undefined }}>
                                        {/[A-Z]/.test(password) && <CheckIcon />} Uppercase
                                    </span>
                                    <span style={{ color: /[0-9]/.test(password) ? "#3fb950" : undefined }}>
                                        {/[0-9]/.test(password) && <CheckIcon />} Number
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}

                    <button
                        className={`auth-btn ${isAdmin ? "admin" : "primary"}`}
                        onClick={signup}
                        disabled={loading}
                    >
                        {loading ? (
                            <span className="btn-spinner" />
                        ) : (
                            "Create Account"
                        )}
                    </button>
                </div>

                <div className="auth-footer">
                    Already have an account?{" "}
                    <Link to={loginPath}>Sign in</Link>
                </div>
            </div>
        </div>
    );
}
