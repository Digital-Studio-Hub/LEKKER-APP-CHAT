import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import OpenAI from "openai";

const openrouter = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY,
});

interface DirectoryEntry {
  id: string;
  name: string;
  businessName: string;
  serviceType: string;
  location: string;
  province: string;
  phone: string;
  bio: string;
  avatarColor: string;
}

const DIRECTORY_DATA: DirectoryEntry[] = [
  { id: "d1", name: "Thabo Molefe", businessName: "Molefe Digital Solutions", serviceType: "IT & Technology", location: "Johannesburg", province: "Gauteng", phone: "+27821001001", bio: "Web development, app design, and digital transformation for SMEs.", avatarColor: "#4ECDC4" },
  { id: "d2", name: "Naledi Khumalo", businessName: "Naledi Events & Decor", serviceType: "Events & Entertainment", location: "Durban", province: "KwaZulu-Natal", phone: "+27821002002", bio: "Premium event planning, styling, and venue decoration.", avatarColor: "#FF6B6B" },
  { id: "d3", name: "Sipho Nkosi", businessName: "Nkosi Construction", serviceType: "Construction & Building", location: "Pretoria", province: "Gauteng", phone: "+27821003003", bio: "Residential and commercial building, renovations, and project management.", avatarColor: "#45B7D1" },
  { id: "d4", name: "Lerato Dlamini", businessName: "Lerato's Kitchen", serviceType: "Food & Catering", location: "Soweto", province: "Gauteng", phone: "+27821004004", bio: "Catering for corporate events, weddings, and private functions.", avatarColor: "#96CEB4" },
  { id: "d5", name: "Mandla Zulu", businessName: "Zulu Logistics", serviceType: "Transport & Logistics", location: "Cape Town", province: "Western Cape", phone: "+27821005005", bio: "Nationwide courier, freight, and last-mile delivery services.", avatarColor: "#FFEAA7" },
  { id: "d6", name: "Ayanda Mthembu", businessName: "Ayanda Beauty Bar", serviceType: "Beauty & Wellness", location: "Sandton", province: "Gauteng", phone: "+27821006006", bio: "Hair styling, skincare treatments, nails, and wellness services.", avatarColor: "#DDA0DD" },
  { id: "d7", name: "Bongani Sithole", businessName: "Sithole Legal Advisors", serviceType: "Legal & Consulting", location: "Bloemfontein", province: "Free State", phone: "+27821007007", bio: "Business law, contracts, compliance, and startup advisory.", avatarColor: "#85C1E9" },
  { id: "d8", name: "Zanele Moyo", businessName: "Z-Fit Wellness Studio", serviceType: "Health & Fitness", location: "Umhlanga", province: "KwaZulu-Natal", phone: "+27821008008", bio: "Personal training, group fitness, yoga, and nutrition coaching.", avatarColor: "#F7DC6F" },
  { id: "d9", name: "Kagiso Patel", businessName: "KP Marketing Agency", serviceType: "Marketing & Advertising", location: "Rosebank", province: "Gauteng", phone: "+27821009009", bio: "Social media management, branding, content creation, and digital ads.", avatarColor: "#BB8FCE" },
  { id: "d10", name: "Nomsa Ndlovu", businessName: "Nomsa Fashion House", serviceType: "Fashion & Clothing", location: "Stellenbosch", province: "Western Cape", phone: "+27821010010", bio: "Custom tailoring, African print designs, and fashion retail.", avatarColor: "#98D8C8" },
  { id: "d11", name: "Tshepo Mahlangu", businessName: "Mahlangu Auto Repairs", serviceType: "Automotive", location: "Midrand", province: "Gauteng", phone: "+27821011011", bio: "Vehicle repairs, servicing, panel beating, and diagnostics.", avatarColor: "#FF6B6B" },
  { id: "d12", name: "Palesa Maseko", businessName: "Maseko Accounting", serviceType: "Finance & Accounting", location: "Centurion", province: "Gauteng", phone: "+27821012012", bio: "Tax returns, bookkeeping, payroll, and financial planning for SMEs.", avatarColor: "#4ECDC4" },
  { id: "d13", name: "Vusi Dube", businessName: "Dube Agri-Solutions", serviceType: "Agriculture", location: "Nelspruit", province: "Mpumalanga", phone: "+27821013013", bio: "Farm management, crop consulting, and agri-tech solutions.", avatarColor: "#96CEB4" },
  { id: "d14", name: "Lindiwe Shabalala", businessName: "Lindi Tutoring Hub", serviceType: "Education & Training", location: "Pietermaritzburg", province: "KwaZulu-Natal", phone: "+27821014014", bio: "Tutoring, exam prep, skills development, and online courses.", avatarColor: "#45B7D1" },
  { id: "d15", name: "Themba Mokoena", businessName: "Mokoena Properties", serviceType: "Real Estate", location: "East London", province: "Eastern Cape", phone: "+27821015015", bio: "Property sales, rentals, valuations, and investment advisory.", avatarColor: "#F7DC6F" },
];

const SERVICE_TYPES = [...new Set(DIRECTORY_DATA.map((d) => d.serviceType))].sort();
const PROVINCES = [...new Set(DIRECTORY_DATA.map((d) => d.province))].sort();

export async function registerRoutes(app: Express): Promise<Server> {
  app.get("/api/directory", (req: Request, res: Response) => {
    const { serviceType, province, search } = req.query;

    let results = [...DIRECTORY_DATA];

    if (serviceType && typeof serviceType === "string") {
      results = results.filter((d) => d.serviceType === serviceType);
    }
    if (province && typeof province === "string") {
      results = results.filter((d) => d.province === province);
    }
    if (search && typeof search === "string") {
      const q = search.toLowerCase();
      results = results.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          d.businessName.toLowerCase().includes(q) ||
          d.serviceType.toLowerCase().includes(q) ||
          d.location.toLowerCase().includes(q),
      );
    }

    res.json({ entries: results, filters: { serviceTypes: SERVICE_TYPES, provinces: PROVINCES } });
  });

  app.get("/api/directory/:id", (req: Request, res: Response) => {
    const entry = DIRECTORY_DATA.find((d) => d.id === req.params.id);
    if (!entry) return res.status(404).json({ error: "Not found" });
    res.json(entry);
  });

  app.post("/api/cledwyn/chat", async (req: Request, res: Response) => {
    try {
      const { messages, lekkerNetworkAccess } = req.body;

      const systemPrompt = lekkerNetworkAccess
        ? `You are CledwynAI, a smart and friendly AI assistant for Lekker Network - a business platform for entrepreneurs (Lekkerpreneurs). You help with business advice, product recommendations, service quotes, marketing strategies, and general business operations. You are knowledgeable, professional yet approachable, and always aim to help entrepreneurs succeed. Keep responses concise and actionable. When asked about products or services, suggest checking the Lekker Marketplace.`
        : `You are a helpful, friendly, and knowledgeable AI assistant. You can help with any topic — general knowledge, creative writing, coding, math, science, daily life tips, recommendations, and more. You are conversational, concise, and always aim to be useful. Keep your tone warm and approachable.`;

      const systemMessage = {
        role: "system" as const,
        content: systemPrompt,
      };

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      const stream = await openrouter.chat.completions.create({
        model: "x-ai/grok-3-mini",
        messages: [systemMessage, ...messages],
        stream: true,
        max_tokens: 8192,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
          res.write(`data: ${JSON.stringify({ content })}\n\n`);
        }
      }

      res.write("data: [DONE]\n\n");
      res.end();
    } catch (error) {
      console.error("CledwynAI chat error:", error);
      if (res.headersSent) {
        res.write(
          `data: ${JSON.stringify({ error: "Something went wrong" })}\n\n`,
        );
        res.end();
      } else {
        res.status(500).json({ error: "Failed to process chat" });
      }
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
