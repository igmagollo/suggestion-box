# Homebrew Setup

The `Formula/suggestion-box.rb` file in this repo is a **reference template**. For Homebrew to actually serve the formula, it needs to live in a dedicated tap repository on GitHub.

## Setting up the tap repo

1. Create a new GitHub repo named `igmagollo/homebrew-tap` (the `homebrew-` prefix is what makes `brew tap igmagollo/tap` work).

2. Copy the formula into it:

```
homebrew-tap/
  Formula/
    suggestion-box.rb
```

3. Users can then install with:

```bash
brew install igmagollo/tap/suggestion-box
```

Or explicitly:

```bash
brew tap igmagollo/tap
brew install suggestion-box
```

## Updating the formula for new releases

When a new version is published to npm:

1. Download the tarball and compute the sha256:

```bash
VERSION="0.2.1"  # replace with new version
curl -sL "https://registry.npmjs.org/@igmagollo/suggestion-box/-/suggestion-box-${VERSION}.tgz" -o suggestion-box.tgz
shasum -a 256 suggestion-box.tgz
```

2. Update `Formula/suggestion-box.rb` in the `homebrew-tap` repo:
   - Change the `url` to point to the new version tarball
   - Replace the `sha256` with the new hash

3. Commit and push to `homebrew-tap`. Homebrew picks up the change automatically — users get the new version on their next `brew upgrade`.

## Automating updates

You can automate this with a GitHub Actions workflow in the `homebrew-tap` repo that triggers on npm publish (via a repository dispatch event from the main repo's publish workflow) or runs on a schedule to check for new versions.

A minimal approach: add a step to the main repo's `.github/workflows/publish.yml` that sends a repository dispatch to `homebrew-tap` after a successful npm publish, passing the new version and sha256 as payload.
