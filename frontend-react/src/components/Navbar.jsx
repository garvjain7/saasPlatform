export default function Navbar({ title }) {
    const logout = () => {
        localStorage.removeItem("token");
        window.location.href = "/";
    };

    return (
        <div style={styles.nav}>
            <h3>{title}</h3>
            <button onClick={logout}>Logout</button>
        </div>
    );
}

const styles = {
    nav: {
        display: "flex",
        justifyContent: "space-between",
        padding: "15px",
        background: "#222",
        color: "#fff"
    }
};