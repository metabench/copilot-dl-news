#Requires -Version 5.1
<#
.SYNOPSIS
    Run Node.js CLI tools with proper UTF-8 encoding in PowerShell
.DESCRIPTION
    PowerShell defaults to legacy encoding that mangles Unicode characters.
    This wrapper ensures box-drawing characters (─│┌┐└┘) display correctly.
.EXAMPLE
    .\run-with-utf8.ps1 node tools/dev/md-edit.js docs/CHANGE_PLAN.md --outline
.EXAMPLE
    .\run-with-utf8.ps1 node tools/dev/js-edit.js src/crawl.js --list-functions
#>

param(
    [Parameter(Position=0, Mandatory=$true, ValueFromRemainingArguments=$true)]
    [string[]]$Command
)

# Set PowerShell's output encoding to UTF-8
$OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# Run the command with all arguments
& $Command[0] $Command[1..($Command.Length-1)]

# Preserve exit code
exit $LASTEXITCODE
