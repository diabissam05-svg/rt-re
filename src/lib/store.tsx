import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  ActivityEntry,
  Analytics,
  Category,
  CmsState,
  Credentials,
  GalleryItem,
  HeroSlide,
  Order,
  OrderStatus,
  Product,
  Settings,
  SiteContent,
  VideoSection,
} from "./types";
import { DEFAULT_STATE, DEMO_PRODUCT_IDS } from "./data";
import { translate, type Lang, type TKey } from "./i18n";

const STORAGE_KEY = "dahra_cms_v3";
const LEGACY_STORAGE_KEYS = ["dahra_cms_v2", "dahra_cms_v1"];
const ANALYTICS_KEY = "dahra_analytics_v1";
const VISIT_FLAG = "dahra_visit_counted";
const ACTIVITY_KEY = "dahra_activity_v1";
const ADMIN_USER_KEY = "dahra_admin_user";

export const ADMIN_USERS = ["issam", "halim", "samir", "bilal"];

function loadActivity(): ActivityEntry[] {
  try {
    const raw = localStorage.getItem(ACTIVITY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ActivityEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const EMPTY_ANALYTICS: Analytics = {
  visits: 0,
  orders: 0,
  searches: 0,
  queries: {},
  daily: {},
};

function loadAnalytics(): Analytics {
  try {
    const raw = localStorage.getItem(ANALYTICS_KEY);
    if (!raw) return { ...EMPTY_ANALYTICS };
    return { ...EMPTY_ANALYTICS, ...(JSON.parse(raw) as Partial<Analytics>) };
  } catch {
    return { ...EMPTY_ANALYTICS };
  }
}
const THEME_KEY = "dahra_theme";
const LANG_KEY = "dahra_lang";
const SESSION_KEY = "dahra_admin_session";

function loadState(): CmsState {
  try {
    let raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // One-time migration from legacy keys: keep admin-created data, purge the
      // former factory demo products, and drop the removed "Garantie Officielle"
      // trust badge so the shop only shows admin content.
      for (const legacyKey of LEGACY_STORAGE_KEYS) {
        const legacy = localStorage.getItem(legacyKey);
        if (!legacy) continue;
        const legacyState = JSON.parse(legacy) as Partial<CmsState>;
        if (Array.isArray(legacyState.products)) {
          legacyState.products = legacyState.products.filter(
            (p) => !DEMO_PRODUCT_IDS.includes(p.id)
          );
        }
        if (legacyState.content?.trustBadges) {
          legacyState.content = {
            ...legacyState.content,
            trustBadges: legacyState.content.trustBadges.filter(
              (b) => b.icon !== "warranty"
            ),
          };
        }
        raw = JSON.stringify(legacyState);
        localStorage.setItem(STORAGE_KEY, raw);
        localStorage.removeItem(legacyKey);
        break;
      }
    }
    if (!raw) return structuredClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw) as Partial<CmsState>;
    const credentials = { ...DEFAULT_STATE.credentials, ...parsed.credentials };
    // Migration: replace any previously stored factory credentials with the
    // current ones so /admin authenticates strictly against the new pair.
    const isLegacyFactoryCreds =
      (credentials.username === "dahramotors4x4" && credentials.password === "dahrabaraki") ||
      (credentials.username === "dahramotor" && credentials.password === "dahra4x4") ||
      (credentials.username === "dahramotors" && credentials.password === "dahra4x4");
    if (isLegacyFactoryCreds) {
      credentials.username = DEFAULT_STATE.credentials.username;
      credentials.password = DEFAULT_STATE.credentials.password;
    }
    return {
      settings: (() => {
        const merged = {
          ...DEFAULT_STATE.settings,
          ...parsed.settings,
          social: { ...DEFAULT_STATE.settings.social, ...parsed.settings?.social },
        };
        if (!Array.isArray(merged.phones) || merged.phones.length === 0) {
          merged.phones = [merged.phone];
        }
        if (!merged.mapLink) merged.mapLink = DEFAULT_STATE.settings.mapLink;
        return merged;
      })(),
      credentials,
      hero: (parsed.hero ?? DEFAULT_STATE.hero).map((s) => ({
        ...s,
        mediaType: s.mediaType ?? "image",
        videoUrl: s.videoUrl ?? "",
        videoPoster: s.videoPoster ?? "",
        autoplay: s.autoplay !== false,
        muted: s.muted !== false,
      })),
      videoSection: { ...DEFAULT_STATE.videoSection, ...parsed.videoSection },
      categories: parsed.categories ?? DEFAULT_STATE.categories,
      products: (parsed.products ?? DEFAULT_STATE.products).map((p) => ({
        ...p,
        showLowStockBadge: p.showLowStockBadge !== false,
        showDiscountBadge: p.showDiscountBadge !== false,
      })),
      content: {
        ...DEFAULT_STATE.content,
        ...parsed.content,
        trustBadges: (parsed.content?.trustBadges ?? DEFAULT_STATE.content.trustBadges).map(
          (b) => ({ ...b, enabled: b.enabled !== false })
        ),
      },
      gallery: parsed.gallery ?? DEFAULT_STATE.gallery,
      orders: (parsed.orders ?? []).map((o) => ({ ...o, installation: o.installation ?? null })),
    };
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

interface CmsContextValue {
  state: CmsState;
  lang: Lang;
  theme: "dark" | "light";
  isAdmin: boolean;
  analytics: Analytics;
  activity: ActivityEntry[];
  adminUser: string | null;
  setAdminUser: (name: string | null) => void;
  trackSearch: (query: string) => void;
  trackOrder: () => void;
  t: (key: TKey) => string;
  setLang: (lang: Lang) => void;
  toggleTheme: () => void;
  login: (username: string, password: string) => boolean;
  logout: () => void;
  updateSettings: (patch: Partial<Settings>) => void;
  updateCredentials: (creds: Credentials) => void;
  updateContent: (patch: Partial<SiteContent>) => void;
  updateVideoSection: (patch: Partial<VideoSection>) => void;
  saveHeroSlide: (slide: HeroSlide) => void;
  deleteHeroSlide: (id: string) => void;
  saveCategory: (cat: Category) => void;
  deleteCategory: (id: string) => void;
  saveGalleryItem: (item: GalleryItem) => void;
  deleteGalleryItem: (id: string) => void;
  saveProduct: (product: Product) => void;
  deleteProduct: (id: string) => void;
  addOrder: (order: Order) => void;
  updateOrderStatus: (id: string, status: OrderStatus) => void;
  deleteOrder: (id: string) => void;
  resetContent: () => void;
}

const CmsContext = createContext<CmsContextValue | null>(null);

export function CmsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CmsState>(loadState);
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    // Light mode is the default for new visitors; dark only when explicitly chosen.
    const saved = localStorage.getItem(THEME_KEY);
    return saved === "dark" ? "dark" : "light";
  });
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = localStorage.getItem(LANG_KEY);
    return saved === "ar" ? "ar" : "fr";
  });
  const [isAdmin, setIsAdmin] = useState<boolean>(
    () => sessionStorage.getItem(SESSION_KEY) === "1"
  );
  const [analytics, setAnalytics] = useState<Analytics>(loadAnalytics);
  const [activity, setActivity] = useState<ActivityEntry[]>(loadActivity);
  const [adminUser, setAdminUserState] = useState<string | null>(() =>
    sessionStorage.getItem(ADMIN_USER_KEY)
  );

  const stateRef = useRef(state);
  stateRef.current = state;
  const adminUserRef = useRef<string | null>(adminUser);
  adminUserRef.current = adminUser;

  useEffect(() => {
    try {
      localStorage.setItem(ACTIVITY_KEY, JSON.stringify(activity));
    } catch {
      // ignore quota errors
    }
  }, [activity]);

  const setAdminUser = useCallback((name: string | null) => {
    if (name) sessionStorage.setItem(ADMIN_USER_KEY, name);
    else sessionStorage.removeItem(ADMIN_USER_KEY);
    setAdminUserState(name);
  }, []);

  /** Audit trail: records every admin CRUD operation with the selected user. */
  const logActivity = useCallback((action: string, item: string) => {
    const entry: ActivityEntry = {
      id: crypto.randomUUID(),
      ts: Date.now(),
      user: adminUserRef.current ?? "admin",
      action,
      item,
    };
    setActivity((prev) => [entry, ...prev].slice(0, 500));
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(ANALYTICS_KEY, JSON.stringify(analytics));
    } catch {
      // ignore quota errors
    }
  }, [analytics]);

  // Count one site visit per browser session
  useEffect(() => {
    if (sessionStorage.getItem(VISIT_FLAG)) return;
    sessionStorage.setItem(VISIT_FLAG, "1");
    const today = new Date().toISOString().slice(0, 10);
    setAnalytics((a) => ({
      ...a,
      visits: a.visits + 1,
      daily: { ...a.daily, [today]: (a.daily[today] ?? 0) + 1 },
    }));
  }, []);

  // Real-time analytics sync: cross-tab storage events + 5s polling refresh
  useEffect(() => {
    const pull = () => {
      try {
        const raw = localStorage.getItem(ANALYTICS_KEY);
        if (!raw) return;
        const next = JSON.parse(raw) as Analytics;
        setAnalytics((prev) =>
          JSON.stringify(prev) === JSON.stringify(next)
            ? prev
            : { ...EMPTY_ANALYTICS, ...next }
        );
      } catch {
        // ignore malformed payloads
      }
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === ANALYTICS_KEY) pull();
    };
    window.addEventListener("storage", onStorage);
    const id = setInterval(pull, 5000);
    return () => {
      window.removeEventListener("storage", onStorage);
      clearInterval(id);
    };
  }, []);

  const trackSearch = useCallback((query: string) => {
    const q = query.trim().toLowerCase();
    if (!q) return;
    setAnalytics((a) => ({
      ...a,
      searches: a.searches + 1,
      queries: { ...a.queries, [q]: (a.queries[q] ?? 0) + 1 },
    }));
  }, []);

  const trackOrder = useCallback(() => {
    setAnalytics((a) => ({ ...a, orders: a.orders + 1 }));
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // storage full (large images) — keep app running
    }
  }, [state]);

  // Real-time cross-tab synchronization: admin edits instantly propagate to
  // any open storefront tab (and vice versa) without a manual refresh.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          setState(JSON.parse(e.newValue) as CmsState);
        } catch {
          // ignore malformed payloads
        }
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    localStorage.setItem(LANG_KEY, lang);
  }, [lang]);

  const t = useCallback((key: TKey) => translate(key, lang), [lang]);

  const login = useCallback(
    (username: string, password: string) => {
      // Trim + case-insensitive username match prevents mobile keyboard
      // auto-capitalization from causing false authentication errors.
      if (
        username.trim().toLowerCase() ===
          state.credentials.username.trim().toLowerCase() &&
        password === state.credentials.password
      ) {
        sessionStorage.setItem(SESSION_KEY, "1");
        setIsAdmin(true);
        return true;
      }
      return false;
    },
    [state.credentials]
  );

  const logout = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(ADMIN_USER_KEY);
    setAdminUserState(null);
    setIsAdmin(false);
  }, []);

  const updateSettings = useCallback(
    (patch: Partial<Settings>) => {
      setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
      logActivity("Paramètres mis à jour", "Contact / coordonnées / branding");
    },
    [logActivity]
  );

  const updateCredentials = useCallback(
    (creds: Credentials) => {
      setState((s) => ({ ...s, credentials: creds }));
      logActivity("Identifiants mis à jour", `Utilisateur : ${creds.username}`);
    },
    [logActivity]
  );

  const updateContent = useCallback(
    (patch: Partial<SiteContent>) => {
      setState((s) => ({ ...s, content: { ...s.content, ...patch } }));
      logActivity("Contenu / copywriting mis à jour", "Page d'accueil");
    },
    [logActivity]
  );

  const updateVideoSection = useCallback(
    (patch: Partial<VideoSection>) => {
      setState((s) => ({
        ...s,
        videoSection: { ...s.videoSection, ...patch },
      }));
      logActivity("Section vidéo mise à jour", patch.title?.fr ?? "Bannière vidéo (accueil)");
    },
    [logActivity]
  );

  const saveHeroSlide = useCallback(
    (slide: HeroSlide) => {
      const exists = stateRef.current.hero.some((h) => h.id === slide.id);
      setState((s) => ({
        ...s,
        hero: exists
          ? s.hero.map((h) => (h.id === slide.id ? slide : h))
          : [...s.hero, slide],
      }));
      logActivity(
        exists ? "Slide hero modifié" : "Slide hero ajouté",
        slide.title.fr || slide.id
      );
    },
    [logActivity]
  );

  const deleteHeroSlide = useCallback(
    (id: string) => {
      const slide = stateRef.current.hero.find((h) => h.id === id);
      setState((s) => ({ ...s, hero: s.hero.filter((h) => h.id !== id) }));
      logActivity("Slide hero supprimé", slide?.title.fr || id);
    },
    [logActivity]
  );

  const saveCategory = useCallback(
    (cat: Category) => {
      const exists = stateRef.current.categories.some((c) => c.id === cat.id);
      setState((s) => ({
        ...s,
        categories: exists
          ? s.categories.map((c) => (c.id === cat.id ? cat : c))
          : [...s.categories, cat],
      }));
      logActivity(
        exists ? "Catégorie modifiée" : "Catégorie ajoutée",
        cat.name.fr || cat.slug
      );
    },
    [logActivity]
  );

  const deleteCategory = useCallback(
    (id: string) => {
      const cat = stateRef.current.categories.find((c) => c.id === id);
      setState((s) => ({ ...s, categories: s.categories.filter((c) => c.id !== id) }));
      logActivity("Catégorie supprimée", cat?.name.fr || id);
    },
    [logActivity]
  );

  const saveGalleryItem = useCallback(
    (item: GalleryItem) => {
      const exists = stateRef.current.gallery.some((g) => g.id === item.id);
      setState((s) => ({
        ...s,
        gallery: exists
          ? s.gallery.map((g) => (g.id === item.id ? item : g))
          : [item, ...s.gallery],
      }));
      logActivity(
        exists ? "Build (galerie) modifié" : "Build (galerie) ajouté",
        item.title.fr || item.id
      );
    },
    [logActivity]
  );

  const deleteGalleryItem = useCallback(
    (id: string) => {
      const item = stateRef.current.gallery.find((g) => g.id === id);
      setState((s) => ({ ...s, gallery: s.gallery.filter((g) => g.id !== id) }));
      logActivity("Build (galerie) supprimé", item?.title.fr || id);
    },
    [logActivity]
  );

  const saveProduct = useCallback(
    (product: Product) => {
      const exists = stateRef.current.products.some((p) => p.id === product.id);
      setState((s) => ({
        ...s,
        products: exists
          ? s.products.map((p) => (p.id === product.id ? product : p))
          : [product, ...s.products],
      }));
      logActivity(
        exists ? "Produit modifié" : "Produit ajouté",
        `${product.name} — ${product.price.toLocaleString("fr-FR")} DA / stock ${product.stock}`
      );
    },
    [logActivity]
  );

  const deleteProduct = useCallback(
    (id: string) => {
      const p = stateRef.current.products.find((x) => x.id === id);
      setState((s) => ({ ...s, products: s.products.filter((p) => p.id !== id) }));
      logActivity("Produit supprimé", p?.name || id);
    },
    [logActivity]
  );

  const addOrder = useCallback(
    (order: Order) => {
      setState((s) => ({ ...s, orders: [order, ...s.orders] }));
      logActivity(
        "Nouvelle commande enregistrée",
        `${order.reference} — ${order.customerName} (${order.wilaya})`
      );
    },
    [logActivity]
  );

  const updateOrderStatus = useCallback(
    (id: string, status: OrderStatus) => {
      const order = stateRef.current.orders.find((o) => o.id === id);
      setState((s) => ({
        ...s,
        orders: s.orders.map((o) => (o.id === id ? { ...o, status } : o)),
      }));
      logActivity(
        "Statut de commande modifié",
        `${order?.reference || id} → ${status}`
      );
    },
    [logActivity]
  );

  const deleteOrder = useCallback(
    (id: string) => {
      const order = stateRef.current.orders.find((o) => o.id === id);
      setState((s) => ({ ...s, orders: s.orders.filter((o) => o.id !== id) }));
      logActivity("Commande supprimée", order?.reference || id);
    },
    [logActivity]
  );

  const resetContent = useCallback(() => {
    setState((s) => ({ ...s, content: DEFAULT_STATE.content }));
    logActivity("Contenu réinitialisé", "Valeurs d'usine");
  }, [logActivity]);

  const value = useMemo<CmsContextValue>(
    () => ({
      state,
      lang,
      theme,
      isAdmin,
      analytics,
      activity,
      adminUser,
      setAdminUser,
      trackSearch,
      trackOrder,
      t,
      setLang: setLangState,
      toggleTheme: () => setTheme((th) => (th === "dark" ? "light" : "dark")),
      login,
      logout,
      updateSettings,
      updateCredentials,
      updateContent,
      updateVideoSection,
      saveHeroSlide,
      deleteHeroSlide,
      saveCategory,
      deleteCategory,
      saveGalleryItem,
      deleteGalleryItem,
      saveProduct,
      deleteProduct,
      addOrder,
      updateOrderStatus,
      deleteOrder,
      resetContent,
    }),
    [
      state,
      lang,
      theme,
      isAdmin,
      analytics,
      activity,
      adminUser,
      setAdminUser,
      trackSearch,
      trackOrder,
      t,
      login,
      logout,
      updateSettings,
      updateCredentials,
      updateContent,
      updateVideoSection,
      saveHeroSlide,
      deleteHeroSlide,
      saveCategory,
      deleteCategory,
      saveGalleryItem,
      deleteGalleryItem,
      saveProduct,
      deleteProduct,
      addOrder,
      updateOrderStatus,
      deleteOrder,
      resetContent,
    ]
  );

  return <CmsContext.Provider value={value}>{children}</CmsContext.Provider>;
}

export function useCms(): CmsContextValue {
  const ctx = useContext(CmsContext);
  if (!ctx) throw new Error("useCms must be used within CmsProvider");
  return ctx;
}

export function buildWhatsAppLink(
  whatsapp: string,
  message: string
): string {
  const digits = whatsapp.replace(/[^\d]/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export function productWhatsAppMessage(
  name: string,
  sku: string,
  price: string
): string {
  return `Bonjour Dahra Motors 4x4 👋\n\nJe souhaite commander :\n📦 Produit : ${name}\n🔖 SKU : ${sku}\n💰 Prix affiché : ${price}\n\nMerci de me confirmer la disponibilité et la livraison.`;
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
