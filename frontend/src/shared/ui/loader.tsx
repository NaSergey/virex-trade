"use client";

import { memo } from "react";

const Loader = memo(() => {
  return (
    <div className="flex items-center justify-center">
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-fg"></div>
    </div>
  );
});

Loader.displayName = "Loader";

export default Loader;
