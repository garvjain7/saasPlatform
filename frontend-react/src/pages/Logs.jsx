import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import Table from "../components/table";
import axios from "axios";
import { useEffect, useState } from "react";

export default function LogsPage() {
    const [logs, setLogs] = useState([]);

    useEffect(() => {
        axios.get("http://localhost:5000/admin/logs", {
            headers: { authorization: localStorage.getItem("token") }
        }).then(res => {
            const formatted = res.data.map(l => ({
                User: l.userId?.name,
                Action: l.action,
                Dataset: l.datasetId?.fileName,
                Time: new Date(l.timestamp).toLocaleString()
            }));
            setLogs(formatted);
        });
    }, []);

    return (
        <div>
            <Navbar title="Logs" />
            <Sidebar />

            <div style={{ marginLeft: "220px", padding: "20px" }}>
                <Table columns={["User", "Action", "Dataset", "Time"]} data={logs} />
            </div>
        </div>
    );
}