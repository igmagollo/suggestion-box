class SuggestionBox < Formula
  desc "Centralized feedback registry MCP for coding agents"
  homepage "https://github.com/igmagollo/suggestion-box"
  url "https://registry.npmjs.org/@igmagollo/suggestion-box/-/suggestion-box-0.2.1.tgz"
  sha256 "UPDATE_WITH_ACTUAL_SHA256"
  license "MIT"

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    assert_match "suggestion-box", shell_output("#{bin}/suggestion-box help")
  end
end
