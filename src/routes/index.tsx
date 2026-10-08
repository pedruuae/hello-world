import "../features/corredor/compat";
import { createFileRoute } from "@tanstack/react-router";
import App from "../features/corredor/App";
export const Route = createFileRoute("/")({ component: App });
