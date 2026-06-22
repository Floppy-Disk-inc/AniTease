interface Window {
    __ytPlayer: any;
    __ytPlayerReady: boolean;
    __pendingVideoId: string | null;
    onYouTubeIframeAPIReady: () => void;
}
