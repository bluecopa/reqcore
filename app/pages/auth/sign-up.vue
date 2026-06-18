<script setup lang="ts">
definePageMeta({
    layout: "auth",
    middleware: ["guest"],
});

useSeoMeta({
    title: "Sign Up — Bluecopa",
    description: "Create your Bluecopa account",
    robots: "noindex, nofollow",
});

const route = useRoute();
const name = ref("");
const email = ref("");
const password = ref("");
const confirmPassword = ref("");
const error = ref("");
const isLoading = ref(false);
const localePath = useLocalePath();
const { track } = useTrack();
const { data: authProviders } = await useFetch('/api/auth/providers');
const oidcEnabled = computed(() => authProviders.value?.oidc ?? false);
const oidcProviderName = computed(
    () => authProviders.value?.oidcProviderName || "SSO",
);
const socialLoading = ref<string | null>(null);

const socialProviders = computed(() => {
    const providers: { id: string; name: string }[] = [];
    if (authProviders.value?.google) providers.push({ id: "google", name: "Google" });
    if (authProviders.value?.github) providers.push({ id: "github", name: "GitHub" });
    if (authProviders.value?.microsoft) providers.push({ id: "microsoft", name: "Microsoft" });
    return providers;
});

onMounted(() => track("signup_page_viewed"));

// If the user arrived from an invitation link, we'll redirect back after sign-up
const pendingInvitation = computed(
    () => route.query.invitation as string | undefined,
);

async function handleSignUp() {
    error.value = "";

    if (!name.value || !email.value || !password.value) {
        error.value = "All fields are required.";
        return;
    }

    if (password.value.length < 8) {
        error.value = "Password must be at least 8 characters.";
        return;
    }

    if (password.value !== confirmPassword.value) {
        error.value = "Passwords do not match.";
        return;
    }

    isLoading.value = true;

    track("signup_submitted");

    const result = await authClient.signUp.email({
        email: email.value,
        password: password.value,
        name: name.value,
    });

    if (result.error) {
        if (result.error.status === 500) {
            error.value =
                result.error.message && result.error.message !== "Server Error"
                    ? result.error.message
                    : 'Sign-up failed due to a server error. If you are self-hosting, make sure the BETTER_AUTH_URL environment variable is set to your deployment domain (e.g. "https://your-app.up.railway.app") and redeploy.';
        } else {
            error.value =
                result.error.message ?? "Sign-up failed. Please try again.";
        }
        track("signup_failed", { error_type: result.error.code ?? "unknown" });
        isLoading.value = false;
        return;
    }

    track("signup_completed");

    clearNuxtData();

    // If the user was accepting an invitation, redirect back to accept it
    if (pendingInvitation.value) {
        await navigateTo(
            localePath(`/auth/accept-invitation/${pendingInvitation.value}`),
        );
    } else {
        await navigateTo(localePath("/onboarding/create-org"));
    }
}

async function handleSsoSignUp() {
    isLoading.value = true;
    error.value = "";
    const callbackURL = pendingInvitation.value
        ? localePath(`/auth/accept-invitation/${pendingInvitation.value}`)
        : localePath("/dashboard");
    try {
        await authClient.signIn.oauth2({
            providerId: "oidc",
            callbackURL,
        });
    } catch (e: unknown) {
        error.value =
            e instanceof Error
                ? e.message
                : "SSO sign-up failed. Please try again.";
        isLoading.value = false;
    }
}

/**
 * Social sign-up — Google, GitHub, Microsoft.
 * Uses better-auth's built-in signIn.social() which handles the full OAuth redirect flow.
 * New users are auto-registered on first social login.
 */
async function handleSocialSignUp(providerId: string) {
    socialLoading.value = providerId;
    error.value = "";
    const callbackURL = pendingInvitation.value
        ? localePath(`/auth/accept-invitation/${pendingInvitation.value}`)
        : localePath("/onboarding/create-org");
    try {
        await authClient.signIn.social({
            provider: providerId as "google" | "github" | "microsoft",
            callbackURL,
        });
    } catch (e: unknown) {
        error.value =
            e instanceof Error
                ? e.message
                : "Social sign-up failed. Please try again.";
        socialLoading.value = null;
    }
}
</script>

<template>
    <div class="flex flex-col gap-4 items-center text-center">
        <h2
            class="text-xl font-semibold text-surface-900 dark:text-surface-100 mb-2"
        >
            Create your account
        </h2>
        <p class="text-sm text-surface-500 dark:text-surface-400 mb-2">
            Sign in with Google to get started — your account will be created automatically.
        </p>
        <NuxtLink
            :to="pendingInvitation
                ? $localePath({ path: '/auth/sign-in', query: { invitation: pendingInvitation } })
                : $localePath('/auth/sign-in')"
            class="px-4 py-2.5 bg-brand-600 text-white rounded-md text-sm font-medium hover:bg-brand-700 transition-colors no-underline"
        >
            Sign in with Google
        </NuxtLink>
    </div>
</template>
