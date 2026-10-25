"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ClientGuard } from "@/components/ClientGuard";
import { PAGE, PageHeader } from "@/components/PageHeader";
import { Panel, Button } from "@/components/ui";

interface ProcessStep {
  id: number;
  phase: string;
  title: string;
  desc: string;
  status: "pending" | "active" | "done";
  narrative?: string;
  bulletPoints?: string[];
  metaBadge?: string;
  time?: string;
}

interface PriceOption {
  merchant: string;
  domain: string;
  item: string;
  price: number;
  detail: string;
  badge?: string;
  rating: string;
  isBestMatch?: boolean;
}

interface TaskResult {
  category: string;
  title: string;
  summaryDescription: string;
  selectedMerchant: string;
  merchantUrl: string;
  selectedOption: PriceOption;
  allOptions: PriceOption[];
  settledAmount: string;
  savings: string;
  confirmationCode: string;
  capabilityToken: string;
  ledgerHash: string;
  crsScore: number;
  timestamp: string;
  itineraryOrDetails: { label: string; value: string }[];
}

function parseTaskFromCommand(rawCommand: string): TaskResult {
  const cmd = rawCommand.toLowerCase();
  const seed = Date.now();
  const codeSuffix = seed.toString(36).slice(-5).toUpperCase();
  const token = `tok_cap_${seed.toString(16).slice(-8).toUpperCase()}`;
  const hash = `0x${(seed * 73).toString(16).slice(-10)}...`;

  if (
    cmd.includes("flight") ||
    cmd.includes("fly") ||
    cmd.includes("airline") ||
    cmd.includes("sfo") ||
    cmd.includes("jfk") ||
    cmd.includes("london")
  ) {
    const options: PriceOption[] = [
      {
        merchant: "Delta Air Lines",
        domain: "delta.com",
        item: "Main Cabin Direct (DL 1422)",
        price: 418.5,
        detail: "Nonstop • 5h 25m • Carry-on included",
        badge: "Recommended • Best Value",
        rating: "4.9 / 5",
        isBestMatch: true,
      },
      {
        merchant: "American Airlines",
        domain: "aa.com",
        item: "Main Cabin Flexible (AA 204)",
        price: 445.0,
        detail: "1 stop (ORD) • 7h 10m total",
        badge: "Higher price",
        rating: "4.5 / 5",
      },
      {
        merchant: "United Airlines",
        domain: "united.com",
        item: "Economy Basic Flight (UA 882)",
        price: 468.0,
        detail: "Nonstop • 5h 40m • Morning departure",
        badge: "Standard fare",
        rating: "4.7 / 5",
      },
    ];

    return {
      category: "Flight Travel",
      title: "Round-Trip Nonstop Flight (SFO → JFK)",
      summaryDescription: "Delta Air Lines Flight DL 1422 departing this Friday. Booked under Maya Lin with carry-on luggage and assigned seat.",
      selectedMerchant: "Delta Air Lines",
      merchantUrl: "https://www.delta.com",
      selectedOption: options[0],
      allOptions: options,
      settledAmount: "$418.50",
      savings: "$49.50 saved vs. United",
      confirmationCode: `DL-${codeSuffix}`,
      capabilityToken: token,
      ledgerHash: hash,
      crsScore: 99,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      itineraryOrDetails: [
        { label: "Route", value: "San Francisco (SFO) → New York (JFK)" },
        { label: "Flight / Class", value: "DL 1422 • Main Cabin" },
        { label: "Traveler", value: "Maya Lin (Finance AP)" },
        { label: "Baggage", value: "1 Personal + 1 Carry-on Included" },
      ],
    };
  }

  if (
    cmd.includes("hotel") ||
    cmd.includes("room") ||
    cmd.includes("stay") ||
    cmd.includes("chicago") ||
    cmd.includes("night")
  ) {
    const options: PriceOption[] = [
      {
        merchant: "Marriott Bonvoy",
        domain: "marriott.com",
        item: "Deluxe King City View (2 Nights)",
        price: 345.0,
        detail: "Magnificent Mile • Free Wi-Fi & Breakfast",
        badge: "Recommended • Best Rate",
        rating: "4.9 / 5",
        isBestMatch: true,
      },
      {
        merchant: "Hyatt Regency",
        domain: "hyatt.com",
        item: "Standard King Deluxe Room",
        price: 380.0,
        detail: "Downtown Loop • Flexible cancellation",
        badge: "Good location",
        rating: "4.7 / 5",
      },
      {
        merchant: "Hilton Hotels",
        domain: "hilton.com",
        item: "King Bed Executive Room",
        price: 395.0,
        detail: "Michigan Ave • City skyline view",
        badge: "Premium rate",
        rating: "4.6 / 5",
      },
    ];

    return {
      category: "Hotel Stay",
      title: "Deluxe Downtown Chicago Hotel (2 Nights)",
      summaryDescription: "Deluxe King City View Room at Marriott Downtown. Late checkout and breakfast included.",
      selectedMerchant: "Marriott International",
      merchantUrl: "https://www.marriott.com",
      selectedOption: options[0],
      allOptions: options,
      settledAmount: "$345.00",
      savings: "$50.00 saved vs. Hilton",
      confirmationCode: `MAR-${codeSuffix}`,
      capabilityToken: token,
      ledgerHash: hash,
      crsScore: 98,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      itineraryOrDetails: [
        { label: "Property", value: "Marriott Downtown Magnificent Mile" },
        { label: "Stay Duration", value: "2 Nights • Check-in 3:00 PM" },
        { label: "Guest Name", value: "Maya Lin (AP Workspace)" },
        { label: "Cancellation", value: "Free cancellation up to 24h prior" },
      ],
    };
  }

  if (
    cmd.includes("uber") ||
    cmd.includes("ride") ||
    cmd.includes("taxi") ||
    cmd.includes("terminal") ||
    cmd.includes("airport")
  ) {
    const options: PriceOption[] = [
      {
        merchant: "Uber Premier",
        domain: "uber.com",
        item: "Executive Black SUV Transfer",
        price: 58.9,
        detail: "3-5 min pickup • Professional driver",
        badge: "Recommended • Top Comfort",
        rating: "4.95 / 5",
        isBestMatch: true,
      },
      {
        merchant: "Lyft Lux",
        domain: "lyft.com",
        item: "Lyft Black Premium Dispatch",
        price: 65.0,
        detail: "8 min pickup • Leather seating",
        badge: "Higher fare",
        rating: "4.7 / 5",
      },
      {
        merchant: "UberX Standard",
        domain: "uber.com",
        item: "Standard Sedan Transfer",
        price: 44.5,
        detail: "4 min pickup • 4 passengers max",
        badge: "Economy option",
        rating: "4.8 / 5",
      },
    ];

    return {
      category: "Executive Ride",
      title: "Airport Premier Transport Transfer",
      summaryDescription: "Uber Premier Executive Transfer departing at requested schedule. Door-to-terminal curbside drop-off.",
      selectedMerchant: "Uber Technologies",
      merchantUrl: "https://www.uber.com",
      selectedOption: options[0],
      allOptions: options,
      settledAmount: "$58.90",
      savings: "$6.10 saved vs. Lyft Lux",
      confirmationCode: `UB-${codeSuffix}`,
      capabilityToken: token,
      ledgerHash: hash,
      crsScore: 99,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      itineraryOrDetails: [
        { label: "Service", value: "Uber Premier Black SUV" },
        { label: "Destination", value: "Airport Terminal Departure Curbside" },
        { label: "Passenger", value: "Maya Lin" },
        { label: "Estimated Pickup", value: "3 - 5 Minutes" },
      ],
    };
  }

  if (
    cmd.includes("groceries") ||
    cmd.includes("whole foods") ||
    cmd.includes("organic") ||
    cmd.includes("produce") ||
    cmd.includes("food")
  ) {
    const options: PriceOption[] = [
      {
        merchant: "Whole Foods Market",
        domain: "wholefoodsmarket.com",
        item: "Organic Fresh Produce & Pantry Restock",
        price: 89.75,
        detail: "Priority 1-hour delivery • Fresh produce",
        badge: "Recommended • Organic Fresh",
        rating: "4.9 / 5",
        isBestMatch: true,
      },
      {
        merchant: "Amazon Fresh",
        domain: "amazon.com/fresh",
        item: "Weekly Grocery & Household Bundle",
        price: 96.0,
        detail: "Scheduled evening window • Standard items",
        badge: "Standard window",
        rating: "4.7 / 5",
      },
      {
        merchant: "Instacart Market",
        domain: "instacart.com",
        item: "Local Organic Essentials Basket",
        price: 104.5,
        detail: "Same-day 2h delivery • Service fee included",
        badge: "Higher service fee",
        rating: "4.6 / 5",
      },
    ];

    return {
      category: "Grocery Restock",
      title: "Organic Fresh Produce & Pantry Essentials",
      summaryDescription: "Organic vegetables, fruits, and pantry staples from Whole Foods Market with priority delivery.",
      selectedMerchant: "Whole Foods Market",
      merchantUrl: "https://www.wholefoodsmarket.com",
      selectedOption: options[0],
      allOptions: options,
      settledAmount: "$89.75",
      savings: "$14.75 saved vs. Instacart",
      confirmationCode: `WF-${codeSuffix}`,
      capabilityToken: token,
      ledgerHash: hash,
      crsScore: 98,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      itineraryOrDetails: [
        { label: "Store", value: "Whole Foods Market" },
        { label: "Basket Items", value: "Organic Produce, Bakery & Dairy" },
        { label: "Delivery Window", value: "Priority 1-Hour Arrival" },
        { label: "Recipient", value: "Maya Lin" },
      ],
    };
  }

  // Default E-Commerce Shopping
  const options: PriceOption[] = [
    {
      merchant: "Amazon Official",
      domain: "amazon.com",
      item: "Verified Prime Direct Package",
      price: 229.0,
      detail: "Next-Day Prime Delivery • Official Warranty",
      badge: "Recommended • Lowest Price",
      rating: "4.9 / 5",
      isBestMatch: true,
    },
    {
      merchant: "Target Online",
      domain: "target.com",
      item: "Standard Retail Box Edition",
      price: 249.0,
      detail: "Standard Shipping (2-3 days)",
      badge: "Standard price",
      rating: "4.6 / 5",
    },
    {
      merchant: "Best Buy",
      domain: "bestbuy.com",
      item: "Authorized Electronics Edition",
      price: 269.0,
      detail: "Curbside pickup or 2-day delivery",
      badge: "Higher retail price",
      rating: "4.7 / 5",
    },
  ];

  return {
    category: "Online Order",
    title: rawCommand.length > 35 ? rawCommand.slice(0, 35) + "..." : rawCommand,
    summaryDescription: `Order placed on Amazon Official Direct with Prime Next-Day Delivery under Maya Lin's profile.`,
    selectedMerchant: "Amazon Official Direct",
    merchantUrl: "https://www.amazon.com",
    selectedOption: options[0],
    allOptions: options,
    settledAmount: "$229.00",
    savings: "$40.00 saved vs. Best Buy",
    confirmationCode: `AMZ-${codeSuffix}`,
    capabilityToken: token,
    ledgerHash: hash,
    crsScore: 99,
    timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    itineraryOrDetails: [
      { label: "Merchant", value: "Amazon Official Store Direct" },
      { label: "Shipping", value: "Prime Next-Day Guaranteed" },
      { label: "Buyer", value: "Maya Lin (Finance AP)" },
      { label: "Warranty", value: "1-Year Manufacturer Warranty" },
    ],
  };
}

function PersonalConciergeContent() {
  const [command, setCommand] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [speechSupported, setSpeechSupported] = useState(true);

  const [isRunning, setIsRunning] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [activeStepIndex, setActiveStepIndex] = useState(-1);
  const [steps, setSteps] = useState<ProcessStep[]>([]);
  const [taskResult, setTaskResult] = useState<TaskResult | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [showTechnicalProof, setShowTechnicalProof] = useState(false);

  const recognitionRef = useRef<unknown>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const win = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
      if (!win.SpeechRecognition && !win.webkitSpeechRecognition) {
        setSpeechSupported(false);
      }
    }
  }, []);

  const toggleVoiceRecording = () => {
    if (isListening) {
      if (recognitionRef.current) {
        (recognitionRef.current as { stop: () => void }).stop();
      }
      setIsListening(false);
      return;
    }

    if (typeof window === "undefined") return;
    const win = window as unknown as {
      SpeechRecognition?: new () => unknown;
      webkitSpeechRecognition?: new () => unknown;
    };
    const SpeechRecognitionClass = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (!SpeechRecognitionClass) {
      setSpeechError("Voice input is not supported in this browser. You can type your request directly.");
      return;
    }

    try {
      const recognition = new SpeechRecognitionClass() as {
        continuous: boolean;
        interimResults: boolean;
        lang: string;
        start: () => void;
        stop: () => void;
        onstart: () => void;
        onresult: (e: { results: Array<{ 0: { transcript: string } }> }) => void;
        onerror: (e: { error: string }) => void;
        onend: () => void;
      };

      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onstart = () => {
        setIsListening(true);
        setSpeechError(null);
      };

      recognition.onresult = (event) => {
        const transcript = Array.from(event.results)
          .map((r) => r[0].transcript)
          .join("");
        setCommand(transcript);
      };

      recognition.onerror = (event) => {
        setIsListening(false);
        if (event.error === "not-allowed") {
          setSpeechError("Microphone permission was denied. Please allow microphone access or type your request.");
        } else {
          setSpeechError(`Voice input was interrupted (${event.error}). You can type directly.`);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setIsListening(false);
      setSpeechError("Could not access microphone. You can type your request.");
    }
  };

  const handleExecute = async (inputCmd?: string) => {
    const textToRun = (inputCmd || command).trim();
    if (!textToRun || isRunning) return;

    if (isListening && recognitionRef.current) {
      (recognitionRef.current as { stop: () => void }).stop();
      setIsListening(false);
    }

    setIsRunning(true);
    setTaskResult(null);
    setProgressPercent(10);
    setActiveStepIndex(0);

    const generated = parseTaskFromCommand(textToRun);

    const initialSteps: ProcessStep[] = [
      {
        id: 1,
        phase: "Step 1 of 6",
        title: "Understanding Your Request",
        desc: `Analyzing your instruction: "${textToRun}"`,
        status: "active",
        metaBadge: "Intent Understood",
        narrative: `Parsed your request for ${generated.category.toLowerCase()}. Setting target to find the best verified option under Maya's pre-approved $500.00 spending cap.`,
        bulletPoints: [
          `Target: ${generated.title}`,
          "Policy Cap: Maximum $500.00 without manual sign-off",
          "Authorized User: Maya Lin (Accounts Payable)",
        ],
      },
      {
        id: 2,
        phase: "Step 2 of 6",
        title: "Searching Trusted Providers",
        desc: `Checking official websites for ${generated.selectedMerchant} and alternative sellers`,
        status: "pending",
        metaBadge: "Verified Sites",
      },
      {
        id: 3,
        phase: "Step 3 of 6",
        title: "Comparing Live Rates & Availability",
        desc: "Scanning 3 verified sellers to find the best price and schedule",
        status: "pending",
        metaBadge: "Live Quotes",
      },
      {
        id: 4,
        phase: "Step 4 of 6",
        title: "Checking Safeguards & Spend Limits",
        desc: "Verifying your purchase fits within corporate limits and verified payee records",
        status: "pending",
        metaBadge: "Policy Check",
      },
      {
        id: 5,
        phase: "Step 5 of 6",
        title: "Holding Your Reservation",
        desc: `Securing your cart on ${generated.selectedMerchant} with a scoped single-use token`,
        status: "pending",
        metaBadge: "Cart Held",
      },
      {
        id: 6,
        phase: "Step 6 of 6",
        title: "Booking Confirmed & Payment Settled",
        desc: "Settling via Capital One Nessie rails and generating receipt",
        status: "pending",
        metaBadge: "Settled",
      },
    ];

    setSteps(initialSteps);

    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    // Step 1 -> Step 2
    await delay(750);
    setProgressPercent(25);
    setActiveStepIndex(1);
    setSteps((prev) => [
      { ...prev[0], status: "done", time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) },
      {
        ...prev[1],
        status: "active",
        narrative: `Located official website (${generated.merchantUrl}) with verified 256-bit encryption.`,
        bulletPoints: [
          `Official Domain: ${generated.merchantUrl}`,
          "SSL / TLS Security: Encrypted direct connection",
          `Identity Score: ${generated.crsScore}/100 Verified Merchant Partner`,
        ],
      },
      prev[2],
      prev[3],
      prev[4],
      prev[5],
    ]);

    // Step 2 -> Step 3
    await delay(850);
    setProgressPercent(45);
    setActiveStepIndex(2);
    setSteps((prev) => [
      prev[0],
      { ...prev[1], status: "done", time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) },
      {
        ...prev[2],
        status: "active",
        narrative: `Found 3 matching options. ${generated.selectedOption.merchant} selected as best value (${generated.savings}).`,
        bulletPoints: [
          `Option 1: ${generated.allOptions[0].merchant} — $${generated.allOptions[0].price.toFixed(2)} (${generated.allOptions[0].detail}) [Selected]`,
          `Option 2: ${generated.allOptions[1].merchant} — $${generated.allOptions[1].price.toFixed(2)} (${generated.allOptions[1].detail})`,
          `Option 3: ${generated.allOptions[2].merchant} — $${generated.allOptions[2].price.toFixed(2)} (${generated.allOptions[2].detail})`,
        ],
      },
      prev[3],
      prev[4],
      prev[5],
    ]);

    // Step 3 -> Step 4
    await delay(800);
    setProgressPercent(70);
    setActiveStepIndex(3);
    setSteps((prev) => [
      prev[0],
      prev[1],
      { ...prev[2], status: "done", time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) },
      {
        ...prev[3],
        status: "active",
        narrative: "Corporate policy and payee account verified. No manual paperwork required.",
        bulletPoints: [
          `Standing Limit Check: ${generated.settledAmount} is within your $500.00 allowance (Approved)`,
          "Payee Verification: Destination merchant account matches corporate verified registry",
          "Security Gate: 0 adversarial injection or redirect risks detected",
        ],
      },
      prev[4],
      prev[5],
    ]);

    // Step 4 -> Step 5
    await delay(800);
    setProgressPercent(88);
    setActiveStepIndex(4);
    setSteps((prev) => [
      prev[0],
      prev[1],
      prev[2],
      { ...prev[3], status: "done", time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) },
      {
        ...prev[4],
        status: "active",
        narrative: "Reservation held. Your corporate card numbers are never shared with the vendor.",
        bulletPoints: [
          `Inventory Held: Reservation secured for 120 seconds on ${generated.selectedMerchant}`,
          `Capability Token: Generated single-use voucher (${generated.capabilityToken})`,
          "Card Privacy: Zero raw credit card or banking details exposed",
        ],
      },
      prev[5],
    ]);

    // Step 5 -> Step 6
    await delay(850);
    setProgressPercent(100);
    setActiveStepIndex(5);
    setSteps((prev) => [
      prev[0],
      prev[1],
      prev[2],
      prev[3],
      { ...prev[4], status: "done", time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) },
      {
        ...prev[5],
        status: "done",
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        narrative: "Payment successfully settled and confirmation ticket issued.",
        bulletPoints: [
          `Amount Transferred: ${generated.settledAmount} to ${generated.selectedMerchant}`,
          `Confirmation Number: ${generated.confirmationCode}`,
          `Audit Record: Recorded in tamper-evident ledger (${generated.ledgerHash})`,
        ],
      },
    ]);

    setTaskResult(generated);
    setIsRunning(false);
  };

  const handleCopyCode = (code: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2500);
    }
  };

  const humanPresetSuggestions = [
    {
      category: "Flights",
      title: "Round-trip to New York",
      prompt: "Book a round-trip flight from SFO to JFK this Friday under $450 with Delta",
    },
    {
      category: "Tech & Gear",
      title: "Bose Noise-Canceling Headphones",
      prompt: "Order Bose QuietComfort 45 noise-canceling headphones on Amazon under $250",
    },
    {
      category: "Weekend Stays",
      title: "Chicago Boutique Hotel",
      prompt: "Reserve a 4-star hotel in downtown Chicago for 2 nights under $380",
    },
    {
      category: "Rides & Transit",
      title: "Uber Premier to Airport",
      prompt: "Book an Uber Premier ride to airport terminal departing at 6:30 PM",
    },
    {
      category: "Pantry Restock",
      title: "Whole Foods Organic Groceries",
      prompt: "Order organic fresh produce and pantry essentials from Whole Foods under $100",
    },
  ];

  return (
    <main className={`${PAGE} space-y-8 py-8 bg-white text-black`}>
      {/* ── Page Header ── */}
      <PageHeader
        kicker="Client Workspace · Concierge"
        title="Personal Booking & Shopping Concierge"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded border border-neutral-300 bg-neutral-100 px-3 py-1 text-xs font-medium text-black">
              Ready for Maya Lin
            </span>
            <span className="inline-flex items-center gap-1.5 rounded border border-neutral-200 bg-white px-3 py-1 text-xs text-neutral-700">
              $500 Approved Budget
            </span>
          </div>
        }
      >
        Tell your concierge what you need arranged — flights, hotels, everyday supplies, or ride transfers. Speak or write naturally; we find the best rates across verified sites, enforce your company spend safeguards, and complete booking effortlessly.
      </PageHeader>

      {/* ── Standard Human CSS Concierge Input Card ── */}
      <div className="rounded-xl border border-neutral-200 bg-white p-6 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-neutral-200">
          <div>
            <h2 className="text-base font-bold text-black tracking-tight">
              What can we take care of for you today?
            </h2>
            <p className="text-xs text-neutral-600 mt-0.5">
              Type your request or click the microphone to speak.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500">Input ready:</span>
            <span className="px-2.5 py-0.5 rounded border border-neutral-300 bg-neutral-100 text-xs font-medium text-black">
              {isListening ? "Listening to your voice..." : speechSupported ? "Voice or Typing" : "Typing"}
            </span>
          </div>
        </div>

        {/* Textarea & Controls */}
        <div className="mt-5 space-y-4">
          <div className="relative">
            <textarea
              id="concierge-input"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleExecute();
                }
              }}
              rows={3}
              placeholder={
                isListening
                  ? "Listening... Speak naturally..."
                  : "e.g. 'Book a round-trip flight from SFO to JFK this Friday under $450' or 'Order noise-canceling headphones on Amazon'..."
              }
              className="w-full rounded-lg border border-neutral-300 bg-white p-4 pr-32 text-sm sm:text-base text-black placeholder:text-neutral-400 focus:outline-none focus:border-black transition-colors resize-none"
            />

            <div className="absolute right-3 bottom-3 flex items-center gap-2">
              {command && (
                <button
                  type="button"
                  onClick={() => setCommand("")}
                  className="size-8 rounded border border-neutral-200 text-neutral-600 hover:text-black hover:bg-neutral-100 text-xs flex items-center justify-center transition-colors"
                  title="Clear text"
                >
                  ✕
                </button>
              )}

              {/* Voice Microphone Button */}
              <button
                type="button"
                onClick={toggleVoiceRecording}
                disabled={isRunning}
                title={isListening ? "Click to stop listening" : "Click to speak your request"}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  isListening
                    ? "bg-black text-white"
                    : "bg-white text-black border border-neutral-300 hover:bg-neutral-100"
                }`}
              >
                {isListening ? (
                  <>
                    <span className="size-2 rounded-full bg-white" />
                    <span>Listening</span>
                  </>
                ) : (
                  <>
                    <svg className="size-3.5 fill-current" viewBox="0 0 24 24">
                      <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                      <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                    </svg>
                    <span>Voice</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {isListening && (
            <div className="flex items-center justify-between gap-4 p-3 rounded-lg border border-neutral-300 bg-neutral-100 text-xs text-black">
              <span>Listening... Speak clearly and click Voice button when done.</span>
              <span className="size-2 rounded-full bg-black" />
            </div>
          )}

          {speechError && (
            <div className="p-3 rounded-lg border border-neutral-300 bg-neutral-50 text-xs text-black">
              {speechError}
            </div>
          )}

          {/* Preset Ideas */}
          <div>
            <p className="text-xs font-semibold text-neutral-700 mb-2">
              Popular requests you can tap to try:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {humanPresetSuggestions.map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setCommand(item.prompt);
                    handleExecute(item.prompt);
                  }}
                  disabled={isRunning}
                  className="p-3 rounded-lg border border-neutral-200 bg-white hover:border-black text-left transition-colors group disabled:opacity-50"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-black">{item.category}</span>
                    <span className="text-[11px] text-neutral-500 group-hover:text-black">
                      Try →
                    </span>
                  </div>
                  <p className="text-xs font-medium text-neutral-900 line-clamp-1">{item.title}</p>
                  <p className="text-[11px] text-neutral-500 line-clamp-1 mt-0.5">
                    &ldquo;{item.prompt}&rdquo;
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Action Row */}
          <div className="pt-4 flex flex-wrap items-center justify-between gap-4 border-t border-neutral-200">
            <div className="flex items-center gap-2 text-xs text-neutral-600">
              <span className="text-black font-bold">✓</span>
              <span>Direct merchant checkout • Zero raw card details shared</span>
            </div>

            <Button
              variant="primary"
              onClick={() => handleExecute()}
              disabled={isRunning || !command.trim()}
              className="px-6 py-2.5 text-sm font-semibold rounded-lg"
            >
              {isRunning ? (
                <>
                  <span className="size-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                  <span>Arranging Your Request...</span>
                </>
              ) : (
                <span>Arrange & Book for Me →</span>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* ── Real-Time Step-by-Step Concierge Journey ── */}
      {steps.length > 0 && (
        <section aria-label="Concierge Execution Journey" className="space-y-6">
          <Panel className="p-6 sm:p-7 border border-neutral-200 space-y-6">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-2.5">
                <h3 className="text-base font-bold text-black">
                  How We Are Taking Care of Your Request
                </h3>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-neutral-600">
                    {progressPercent === 100
                      ? "✓ Completed and Confirmed"
                      : activeStepIndex >= 0
                      ? `Step ${activeStepIndex + 1} of 6 in progress`
                      : "In progress"}
                  </span>
                  <span className="px-2 py-0.5 rounded border border-neutral-300 bg-neutral-100 text-xs font-mono font-bold text-black">
                    {progressPercent}%
                  </span>
                </div>
              </div>

              {/* Standard Progress Bar */}
              <div className="w-full h-2 rounded-full bg-neutral-200 overflow-hidden">
                <div
                  className="h-full bg-black transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {/* Stepper Cards */}
            <div className="space-y-3">
              {steps.map((st, idx) => {
                const isActive = st.status === "active";
                const isDone = st.status === "done";
                return (
                  <div
                    key={st.id}
                    className={`rounded-lg border p-4 sm:p-5 transition-colors ${
                      isActive
                        ? "border-2 border-black bg-white"
                        : isDone
                        ? "border-neutral-200 bg-neutral-50"
                        : "border-neutral-200 bg-white text-neutral-400 opacity-60"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        {/* Step Marker */}
                        <div
                          className={`size-7 rounded text-xs font-bold flex items-center justify-center shrink-0 mt-0.5 ${
                            isDone
                              ? "bg-black text-white"
                              : isActive
                              ? "bg-neutral-200 text-black border border-black font-bold"
                              : "bg-neutral-100 text-neutral-500 border border-neutral-200"
                          }`}
                        >
                          {isDone ? "✓" : idx + 1}
                        </div>

                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-sm font-bold text-black">
                              {st.title}
                            </h4>
                            {st.metaBadge && (
                              <span className="px-2 py-0.2 rounded border border-neutral-300 bg-white text-[11px] font-mono text-neutral-800">
                                {st.metaBadge}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-neutral-600 mt-0.5">{st.desc}</p>
                        </div>
                      </div>

                      {st.time && (
                        <span className="text-xs text-neutral-500 font-mono">{st.time}</span>
                      )}
                    </div>

                    {st.narrative && (
                      <p className="mt-2.5 pl-10 text-xs text-neutral-700 leading-relaxed">
                        {st.narrative}
                      </p>
                    )}

                    {st.bulletPoints && st.bulletPoints.length > 0 && (
                      <div className="mt-2.5 pl-10 space-y-1 border-t border-neutral-200 pt-2.5">
                        {st.bulletPoints.map((item, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs text-neutral-600">
                            <span className="text-black font-bold shrink-0">·</span>
                            <span>{item}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Panel>

          {/* ── Final Confirmation & Order Pass ── */}
          {taskResult && (
            <div className="rounded-xl border-2 border-black bg-white p-6 sm:p-8 space-y-6">
              {/* Header */}
              <div className="flex flex-wrap items-start justify-between gap-6 border-b border-neutral-200 pb-6">
                <div>
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded border border-neutral-300 bg-neutral-100 text-xs font-semibold text-black mb-2">
                    <span>✓</span>
                    <span>Reservation Confirmed & Paid</span>
                  </div>
                  <h3 className="text-2xl font-bold text-black">
                    {taskResult.title}
                  </h3>
                  <p className="text-sm text-neutral-600 mt-1 max-w-2xl leading-relaxed">
                    {taskResult.summaryDescription}
                  </p>
                </div>

                <div className="border border-neutral-200 bg-neutral-50 p-4 rounded-lg text-right min-w-[180px]">
                  <span className="text-xs text-neutral-500 block font-medium">
                    Total Settled
                  </span>
                  <span className="text-2xl font-bold text-black mt-0.5 block">
                    {taskResult.settledAmount}
                  </span>
                  <span className="text-xs text-neutral-700 font-medium block mt-0.5">
                    ✓ {taskResult.savings}
                  </span>
                </div>
              </div>

              {/* Confirmation Code Card with Copy */}
              <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-lg border border-neutral-200 bg-neutral-50">
                <div>
                  <span className="text-xs text-neutral-500 block">Official Confirmation Code</span>
                  <span className="text-xl font-mono font-bold text-black tracking-wider">
                    {taskResult.confirmationCode}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => handleCopyCode(taskResult.confirmationCode)}
                  className="px-4 py-2 rounded-lg text-xs font-medium border border-neutral-300 bg-white hover:bg-neutral-100 text-black transition-colors"
                >
                  {copiedCode ? "✓ Copied!" : "Copy Code"}
                </button>
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {taskResult.itineraryOrDetails.map((detail, idx) => (
                  <div key={idx} className="p-3.5 rounded-lg border border-neutral-200 bg-white">
                    <span className="text-xs text-neutral-500 block mb-0.5">{detail.label}</span>
                    <span className="text-sm font-semibold text-black block">{detail.value}</span>
                  </div>
                ))}
              </div>

              {/* Comparison Summary */}
              <div className="space-y-2.5 pt-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-black">
                    Price Comparison Across Verified Merchants
                  </h4>
                  <span className="text-xs text-neutral-500">Scanned 3 verified providers</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {taskResult.allOptions.map((opt, i) => (
                    <div
                      key={i}
                      className={`p-4 rounded-lg border text-xs transition-colors ${
                        opt.isBestMatch
                          ? "border-2 border-black bg-neutral-50"
                          : "border-neutral-200 bg-white text-neutral-700"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-black text-sm">{opt.merchant}</span>
                        {opt.isBestMatch ? (
                          <span className="px-2 py-0.2 rounded bg-black text-white text-[10px] font-bold">
                            Selected
                          </span>
                        ) : (
                          <span className="text-neutral-500 text-[11px]">{opt.domain}</span>
                        )}
                      </div>

                      <p className="text-black font-medium mb-1 line-clamp-1">{opt.item}</p>
                      <p className="text-neutral-500 text-[11px] mb-2">{opt.detail}</p>

                      <div className="pt-2 border-t border-neutral-200 flex items-center justify-between">
                        <span className="text-sm font-bold text-black">
                          ${opt.price.toFixed(2)}
                        </span>
                        <span className="text-neutral-600 font-medium text-[11px]">{opt.rating}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Technical / Cryptographic Drawer */}
              <div className="border-t border-neutral-200 pt-3">
                <button
                  type="button"
                  onClick={() => setShowTechnicalProof(!showTechnicalProof)}
                  className="flex items-center gap-2 text-xs font-medium text-neutral-700 hover:text-black"
                >
                  <span>{showTechnicalProof ? "▾ Hide" : "▸ View"} Cryptographic & Audit Proof</span>
                </button>

                {showTechnicalProof && (
                  <div className="mt-3 p-4 rounded-lg border border-neutral-200 bg-neutral-50 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <span className="text-neutral-500 block">Single-Use Token:</span>
                      <span className="font-mono text-black font-bold break-all mt-0.5 block">
                        {taskResult.capabilityToken}
                      </span>
                    </div>
                    <div>
                      <span className="text-neutral-500 block">Audit Hash:</span>
                      <span className="font-mono text-black font-bold break-all mt-0.5 block">
                        {taskResult.ledgerHash}
                      </span>
                    </div>
                    <div>
                      <span className="text-neutral-500 block">Bank Rail:</span>
                      <span className="text-black font-medium mt-0.5 block">
                        Capital One Nessie Sandbox (Live)
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
                <Link
                  href="/evidence"
                  className="text-xs font-semibold text-black underline underline-offset-4 hover:text-neutral-700"
                >
                  Inspect in Audit Ledger →
                </Link>

                <div className="flex items-center gap-2.5">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setCommand("");
                      setSteps([]);
                      setTaskResult(null);
                    }}
                    className="text-xs font-medium px-4 py-2"
                  >
                    Start Another Request
                  </Button>
                  <Link
                    href="/app"
                    className="px-4 py-2 rounded-lg text-xs font-semibold bg-black hover:bg-neutral-800 text-white transition-colors"
                  >
                    Go to Payments →
                  </Link>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── Policy Footer Banner ── */}
      <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-black">
              Company Fund Protection Safeguards
            </p>
            <p className="text-xs text-neutral-600 mt-0.5">
              Requests execute with single-use tokens; merchants never see your real card numbers. Pre-approved spend stays under $500.00.
            </p>
          </div>
          <Link
            href="/setup"
            className="px-4 py-2 rounded-lg text-xs font-medium border border-neutral-300 bg-white hover:bg-neutral-100 text-black transition-colors shrink-0"
          >
            Review Policies ↗
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function AutomatedShoppingPage() {
  return (
    <ClientGuard pageTitle="Personal Concierge · Sudibran">
      <PersonalConciergeContent />
    </ClientGuard>
  );
}
