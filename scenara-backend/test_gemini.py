"""Quick test — run with: python test_gemini.py"""
import asyncio
import os
import sys

# Allow running from repo root without installing the package
sys.path.insert(0, os.path.dirname(__file__))

from app.services.ai_resolver import ai_resolve_event, GEMINI_API_KEY


async def main():
    if not GEMINI_API_KEY:
        print("❌ GEMINI_API_KEY is not set. Add it to your .env file or export it.")
        return

    print(f"✅ GEMINI_API_KEY found ({GEMINI_API_KEY[:8]}...)\n")
    print("Testing with a sample event...\n")

    winner_idx, confidence, note = await ai_resolve_event(
        title="Will Donald Trump win the 2024 US Presidential Election?",
        description="The US Presidential Election took place on November 5, 2024.",
        scenarios=["Yes — Trump wins", "No — Someone else wins"],
    )

    print(f"Winner index : {winner_idx}")
    print(f"Confidence   : {confidence}%")
    print(f"Note         : {note}")

    if winner_idx is not None:
        print("\n✅ AI resolver is working correctly!")
    else:
        print("\n⚠️  AI returned no winner (confidence too low or API issue).")


asyncio.run(main())
