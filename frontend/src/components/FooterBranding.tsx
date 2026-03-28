export default function FooterBranding({ dark = false }: { dark?: boolean }) {
  return (
    <div className={`text-center py-2 text-xs ${dark ? "text-gray-500" : "text-gray-400 border-t border-gray-100"}`}>
      Developed and owned by{" "}
      <a
        href="https://rightleft.ai"
        target="_blank"
        rel="noopener noreferrer"
        className="text-orange-500 hover:text-orange-400 font-medium transition-colors"
      >
        RLAI
      </a>
      {" · "}
      <a href="https://rightleft.ai" target="_blank" rel="noopener noreferrer" className="hover:text-orange-400 transition-colors">
        rightleft.ai
      </a>
    </div>
  );
}
