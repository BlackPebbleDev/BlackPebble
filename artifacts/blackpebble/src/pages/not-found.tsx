import { AlertCircle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-[100dvh] w-full flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <AlertCircle className="h-10 w-10 text-danger mx-auto mb-4" />
        <h1 className="text-2xl font-semibold text-foreground mb-2">404 Page Not Found</h1>
        <p className="text-sm text-muted-foreground">
          The page you are looking for does not exist.
        </p>
      </div>
    </div>
  );
}
