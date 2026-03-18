import { useEffect } from "react";

export default function MockInit() {
  useEffect(() => {
    import("../mocks/init").then(({ initMocks }) => initMocks());
  }, []);

  return null;
}
