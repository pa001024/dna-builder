<script lang="ts" setup>
import { computed, ref } from "vue"
import { useRouter } from "vue-router"
import { type DBGlobalSearchOption, GlobalSearchService } from "@/utils/global-search"

const router = useRouter()

/**
 * 跳转到指定资料库页面。
 */
function navigateTo(path: string) {
    router.push(path)
}

const searchKeyword = ref("")

const databaseItems = [
    {
        name: "database.char",
        path: "/db/char",
        desc: "database.char_desc",
        icon: "M8.649 2.766c1.593-2.65 5.952-2.374 7.233 0.428 1.369 2.509-0.504 5.636-3.206 6.097 2.406 0.165 4.872 0.803 6.742 2.397-3.901 1.6-3.967 6.067-5.652 9.306 1.992 0.043 7.749-1.432 4.062-3.723 1.705 0.461 6.34 1.435 4.378 3.944-4.546 2.713-10.264 2.4-15.347 1.814-1.975-0.494-4.81-0.685-5.662-2.834 0.484-2.13 3.266-2.288 4.978-2.923-3.717 2.367 2.235 3.799 4.253 3.723-1.751-3.243-1.87-7.749-5.84-9.306 1.962-1.636 4.54-2.212 7.025-2.416-2.927-0.405-4.76-4.036-2.963-6.505z",
        color: "from-rose-500/20 to-pink-600/20 text-rose-500",
    },
    {
        name: "database.weapon",
        path: "/db/weapon",
        desc: "database.weapon_desc",
        icon: "M10.62 1.711c0.433-0.61 0.897-1.198 1.38-1.77 0.489 0.572 0.953 1.16 1.377 1.779-0.613 1.083-0.727 2.389-0.204 3.531 1.009 0.504 2.132 0.619 3.218 0.306 0.186 1.117-0.226 2.228-1.185 2.859-0.328-0.424-0.665-0.842-1.024-1.244-0.192 0.111-0.572 0.331-0.764 0.442-0.569 5.418 0.622 11.174-1.417 16.326-2.039-5.152-0.842-10.908-1.417-16.326-0.192-0.111-0.576-0.331-0.764-0.442-0.359 0.402-0.696 0.817-1.027 1.241-0.947-0.634-1.371-1.739-1.198-2.856 2.605 1.191 4.737-1.569 3.026-3.846z M9.713 21.49c-7.655-1.665-9.648-13.024-2.918-17.081-3.255 3.63-1.773 9.874 2.838 11.53-0.006 1.85 0.102 3.701 0.080 5.551z M17.223 4.419c6.721 4.060 4.71 15.487-2.992 17.053 0.040-1.844 0.102-3.685 0.118-5.53 4.62-1.637 6.108-7.881 2.875-11.523z",
        color: "from-violet-500/20 to-purple-600/20 text-violet-500",
    },
    {
        name: "database.resource",
        path: "/db/resource",
        desc: "database.resource_desc",
        icon: "M12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2ZM12 4C7.58172 4 4 7.58172 4 12C4 16.4183 7.58172 20 12 20C16.4183 20 20 16.4183 20 12C20 7.58172 16.4183 4 12 4ZM7 8H17V10H7V8ZM7 12H17V14H7V12ZM7 16H13V18H7V16Z",
        color: "from-slate-500/20 to-zinc-600/20 text-slate-500",
    },
    {
        name: "database.mod",
        path: "/db/mod",
        desc: "database.mod_desc",
        icon: "M8.18 7.124c0.115-2.741 1.904-5.034 3.82-6.845 1.917 1.808 3.698 4.111 3.82 6.849 0.053 2.827-1.762 5.252-3.711 7.122 2.616-0.802 5.724-1.178 8.129 0.409 2.154 1.547 3.216 4.147 3.758 6.657-2.811 0.904-6.285 1.293-8.719-0.726-1.821-1.435-2.497-3.715-3.322-5.777-0.729 2.395-1.752 4.975-4.008 6.321-2.421 1.392-5.4 0.983-7.951 0.178 0.574-2.573 1.659-5.298 3.969-6.783 2.395-1.442 5.381-1.062 7.931-0.277-1.953-1.871-3.771-4.299-3.715-7.129zM11.103 5.442c-2.382 1.026-0.633 4.981 1.752 3.764 2.431-1.006 0.653-5.071-1.752-3.764zM5.531 15.774c-2.494 0.488-1.715 4.602 0.802 4.078 2.732-0.31 1.874-4.843-0.802-4.078zM17.72 15.741c-2.619 0.191-2.108 4.566 0.495 4.124 2.646-0.181 2.154-4.589-0.495-4.124z M2.667 13.927c1.3-2.735 2.834-5.354 4.533-7.861-0.224 2.293 0.231 4.658 1.653 6.512-2.138-0.129-4.404 0.023-6.186 1.349z M16.8 5.871c1.732 2.596 3.299 5.295 4.635 8.115-1.814-1.349-4.107-1.547-6.291-1.405 1.478-1.903 1.88-4.358 1.656-6.71z M7.299 22.761c2.131-0.785 3.698-2.573 4.685-4.566 1.019 1.956 2.534 3.764 4.661 4.539-3.114 0.208-6.232 0.211-9.346 0.026z",
        color: "from-indigo-500/20 to-blue-600/20 text-indigo-500",
    },
    {
        name: "database.damage",
        path: "/db/damage",
        desc: "database.damage_desc",
        icon: "M4 3C2.89543 3 2 3.89543 2 5V19C2 20.1046 2.89543 21 4 21H20C21.1046 21 22 20.1046 22 19V5C22 3.89543 21.1046 3 20 3H4ZM4 5H20V19H4V5ZM6 7H8V9H6V7ZM10 7H16V9H10V7ZM6 11H8V13H6V11ZM10 11H18V13H10V11ZM6 15H8V17H6V15ZM10 15H14V17H10V15Z",
        color: "from-lime-500/20 to-emerald-600/20 text-lime-500",
    },
    {
        name: "database.draft",
        path: "/db/draft",
        desc: "database.draft_desc",
        icon: "M8.154 0.050c1.646 0.513 3.287 1.055 4.939 1.558-0.34 1.143-0.697 2.279-1.099 3.398-0.48 0-0.961 0.006-1.441-0.006-0.079 0.149-0.234 0.445-0.311 0.592 3.36 1.084 6.732 2.144 10.098 3.214-0.126 0.457-0.267 0.911-0.48 1.339-3.559 0-6.779-1.969-10.239-2.637-0.258 0.735 0.768 0.908 1.181 1.292-0.138 0.439-0.287 0.879-0.442 1.312-1.816 0.059-3.633 0.015-5.452 0.023 0.255-0.967 0.609-1.901 0.935-2.845 0.179-0.041 0.539-0.123 0.718-0.164 0.308-1.093 0.7-2.159 1.031-3.243-0.129-0.126-0.393-0.378-0.524-0.504 0.357-1.113 0.721-2.223 1.087-3.331zM0.253 10.907c1.813-0.018 3.627-0.038 5.44 0.006 0.006 1.342 0.82 2.642 2.059 3.181-0.671-0.961-0.627-2.092-0.527-3.205 5.103 0.006 10.206 0 15.31 0.003 0.015 0.489 0.018 0.978 0.012 1.468-3.322 0.27-8.176 1.456-7.974 5.689-1.392 0.006-2.786-0.003-4.177 0.012-1.966-4.347-8.308-2.64-10.142-7.154zM7.439 22.529c-0.038-4.825 7.649-5.176 10.042-1.658-0.018 0.554-0.006 1.107-0.012 1.664-3.343 0.015-6.688 0.029-10.031-0.006z",
        color: "from-sky-500/20 to-indigo-600/20 text-sky-500",
    },
    {
        name: "database.pet",
        path: "/db/pet",
        desc: "database.pet_desc",
        icon: "M5.784 7.676c-2.515-1.31-2.825-4.283-1.956-6.738 1.963 0.875 5.64 2.431 4.451 5.142 2.472-1.118 5.344-1.017 7.778 0.148-1.243-2.785 2.404-4.411 4.455-5.283 0.953 2.562 0.434 5.542-2.138 6.879 3.051 2.855 5.566 7.485 3.785 11.651-2.142 3.701-7.024 3.973-10.839 3.963-3.549-0.104-8.108-0.751-9.694-4.438-1.34-4.182 1.121-8.549 4.159-11.324zM7.451 11.475c-1.63 1.653-1.714 5.162 0.259 6.556 2.768-0.364 2.694-6.798-0.259-6.556zM15.532 11.471c-1.63 1.657-1.714 5.165 0.259 6.559 2.768-0.367 2.694-6.798-0.259-6.559z",
        color: "from-pink-500/20 to-rose-600/20 text-pink-500",
    },
    {
        name: "database.dungeon",
        path: "/db/dungeon",
        desc: "database.dungeon_desc",
        icon: "M12 20.8995L16.9497 15.9497C19.6834 13.2161 19.6834 8.78392 16.9497 6.05025C14.2161 3.31658 9.78392 3.31658 7.05025 6.05025C4.31658 8.78392 4.31658 13.2161 7.05025 15.9497L12 20.8995ZM12 23.7279L5.63604 17.364C2.12132 13.8492 2.12132 8.15076 5.63604 4.63604C9.15076 1.12132 14.8492 1.12132 18.364 4.63604C21.8787 8.15076 21.8787 13.8492 18.364 17.364L12 23.7279ZM12 13C13.1046 13 14 12.1046 14 11C14 9.89543 13.1046 9 12 9C10.8954 9 10 9.89543 10 11C10 12.1046 10.8954 13 12 13ZM12 15C9.79086 15 8 13.2091 8 11C8 8.79086 9.79086 7 12 7C14.2091 7 16 8.79086 16 11C16 13.2091 14.2091 15 12 15Z",
        color: "from-amber-500/20 to-orange-600/20 text-amber-500",
    },
    {
        name: "database.appearance",
        path: "/db/accessory",
        desc: "database.appearance_desc",
        icon: "M2.797 6.691c3.525-6.19 13.123-9.239 18.833-4.321 2.182 1.752 1.361 5.014-0.824 6.357-1.997 1.407-0.338 3.642 1.237 4.527-4.033 0.497-6.385 5.085-4.818 8.752-4.289 2.598-10.557 2.864-14.121-1.102-3.553-3.912-2.743-9.942-0.306-14.214zM9.314 6.67c-0.082 2.107 3.081 2.040 3.205 0.004-0.203-1.894-3.187-2.008-3.205-0.004zM6.801 8.969c-2.715 0.682-1.365 5.231 1.311 4.15 2.672-0.743 1.286-5.017-1.311-4.15zM6.403 15.639c-2.956 1.155-0.824 5.987 2.025 4.527 2.996-1.151 0.846-6.016-2.025-4.527z",
        color: "from-fuchsia-500/20 to-purple-600/20 text-fuchsia-500",
    },
    {
        name: "database.abyss_dungeon",
        path: "/db/abyss",
        desc: "database.abyss_dungeon_desc",
        icon: "M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 20C7.59 20 4 16.41 4 12C4 7.59 7.59 4 12 4C16.41 4 20 7.59 20 12C20 16.41 16.41 20 12 20ZM12 7C9.24 7 7 9.24 7 12H9C9 10.34 10.34 9 12 9C13.66 9 15 10.34 15 12C15 13.66 13.66 15 12 15C10.34 15 9 13.66 9 12H7C7 14.76 9.24 17 12 17C14.76 17 17 14.76 17 12C17 9.24 14.76 7 12 7Z",
        color: "from-rose-500/20 to-pink-600/20 text-rose-500",
    },
    {
        name: "database.reputation",
        path: "/db/reputation",
        desc: "database.reputation_desc",
        icon: "M12 2C14.4301 2 16.4001 3.97001 16.4001 6.40002C16.4001 8.83003 14.4301 10.8 12 10.8C9.57001 10.8 7.60001 8.83003 7.60001 6.40002C7.60001 3.97001 9.57001 2 12 2ZM12 12.4C16.0869 12.4 19.4 15.7131 19.4 19.8V22H4.60001V19.8C4.60001 15.7131 7.9131 12.4 12 12.4ZM12 14.4C9.01767 14.4 6.60001 16.8177 6.60001 19.8V20H17.4V19.8C17.4 16.8177 14.9823 14.4 12 14.4ZM19.95 3.87868L20.8287 5.12132L22.0713 6L20.8287 6.87868L19.95 8.12132L19.0713 6.87868L17.8287 6L19.0713 5.12132L19.95 3.87868ZM4.05001 3.87868L4.92869 5.12132L6.17133 6L4.92869 6.87868L4.05001 8.12132L3.17133 6.87868L1.92868 6L3.17133 5.12132L4.05001 3.87868Z",
        color: "from-cyan-500/20 to-teal-600/20 text-cyan-500",
    },
    {
        name: "database.rank",
        path: "/db/rank",
        desc: "database.rank_desc",
        icon: "M13.0049 16.9409V19.0027H18.0049V21.0027H6.00488V19.0027H11.0049V16.9409C7.05857 16.4488 4.00488 13.0824 4.00488 9.00275V3.00275H20.0049V9.00275C20.0049 13.0824 16.9512 16.4488 13.0049 16.9409ZM6.00488 5.00275V9.00275C6.00488 12.3165 8.69117 15.0027 12.0049 15.0027C15.3186 15.0027 18.0049 12.3165 18.0049 9.00275V5.00275H6.00488ZM1.00488 5.00275H3.00488V9.00275H1.00488V5.00275ZM21.0049 5.00275H23.0049V9.00275H21.0049V5.00275Z",
        color: "from-emerald-500/20 to-teal-600/20 text-emerald-500",
    },
    {
        name: "database.monster",
        path: "/db/monster",
        desc: "database.monster_desc",
        icon: "M-0.002 1.38c4.029 2.424 7.994 4.957 12.002 7.42 4.008-2.463 7.973-4.993 11.998-7.42-0.776 2.874-1.488 5.772-2.325 8.632-2.197 1.988-4.738 3.607-6.977 5.563 1.704-0.22 3.388-0.595 5.085-0.865 0.113 0.216 0.34 0.645 0.457 0.858-2.7 2.76-5.492 5.429-8.239 8.143-2.746-2.714-5.538-5.386-8.242-8.143 0.117-0.216 0.347-0.641 0.461-0.858 1.701 0.273 3.38 0.645 5.085 0.865-2.239-1.956-4.78-3.575-6.977-5.563-0.836-2.86-1.548-5.758-2.328-8.632z",
        color: "from-cyan-500/20 to-blue-600/20 text-cyan-500",
    },
    {
        name: "database.map",
        path: "/db/map",
        desc: "database.map_desc",
        icon: "M2 5L9 2L15 5L21.303 2.2987C21.5569 2.18992 21.8508 2.30749 21.9596 2.56131C21.9862 2.62355 22 2.69056 22 2.75827V19L15 22L9 19L2.69696 21.7013C2.44314 21.8101 2.14921 21.6925 2.04043 21.4387C2.01375 21.3765 2 21.3094 2 21.2417V5ZM16 19.3955L20 17.6812V5.03308L16 6.74736V19.3955ZM14 19.2639V6.73607L10 4.73607V17.2639L14 19.2639ZM8 17.2526V4.60451L4 6.31879V18.9669L8 17.2526Z",
        color: "from-green-500/20 to-emerald-600/20 text-green-500",
    },
    {
        name: "database.event",
        path: "/db/event",
        desc: "database.event_desc",
        icon: "M12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2ZM11 6H13V13H11V6ZM11 15H13V17H11V15Z",
        color: "from-rose-500/20 to-orange-600/20 text-rose-500",
    },
    {
        name: "魔灵地图",
        path: "/db/map-local",
        desc: "详细魔灵刷新点位",
        icon: "M3 3H21V21H3V3ZM5 5V19H19V5H5ZM7 7H11V11H7V7ZM13 7H17V11H13V7ZM7 13H11V17H7V13ZM13 13H17V17H13V13Z",
        color: "from-cyan-500/20 to-sky-600/20 text-cyan-500",
    },
    {
        name: "database.walnut",
        path: "/db/walnut",
        desc: "database.walnut_desc",
        icon: "M4.98 7.095c2.256-2.445 4.675-4.736 7.020-7.095 2.333 2.356 4.756 4.629 6.991 7.078-2.483-1.109-5.385-1.348-6.991-3.83-1.612 2.494-4.532 2.716-7.020 3.848z M0.267 11.991c3.032-2.865 6.891-5.161 11.135-5.428 4.687-0.193 9.026 2.307 12.336 5.434-2.793 2.687-6.287 4.747-10.147 5.391-0.511-1.239-0.928-2.514-1.46-3.744 1.836-0.279 1.822-3.216-0.132-3.187-1.954-0.029-1.968 2.905-0.132 3.187-0.529 1.23-0.951 2.503-1.457 3.741-3.853-0.647-7.365-2.695-10.144-5.394zM3.819 12c1.644 1.236 3.489 2.19 5.454 2.796-1.457-1.543-1.457-4.060 0.011-5.601-1.971 0.603-3.828 1.555-5.466 2.805zM14.724 9.201c1.457 1.543 1.463 4.063-0.006 5.598 1.977-0.58 3.819-1.56 5.463-2.796-1.641-1.244-3.491-2.193-5.457-2.802z M4.98 16.905c1.526 0.974 3.698 0.92 5.011 2.012 0.014 2.632 4 2.632 4.014 0 1.305-1.089 3.468-1.034 4.991-1.994-2.241 2.445-4.661 4.721-6.997 7.078-2.345-2.359-4.764-4.652-7.020-7.095z",
        color: "from-amber-500/20 to-orange-600/20 text-amber-500",
    },
    {
        name: "database.title_data",
        path: "/db/title",
        desc: "database.title_data_desc",
        icon: "M12 2l2.6 4.2 4.4-2-2 7.3H7l-2-7.3 4.4 2L12 2zm-4.5 13h9l-.8 2H8.3l-.8-2zm-2.8 3h14.6l-1.2 3H5.9l-1.2-3z",
        color: "from-fuchsia-500/20 to-purple-600/20 text-fuchsia-500",
    },
    {
        name: "database.book",
        path: "/db/book",
        desc: "database.book_desc",
        icon: "M3 4.5C3 3.11929 4.11929 2 5.5 2H20V20.75C20 21.4404 19.4404 22 18.75 22H5.5C4.11929 22 3 20.8807 3 19.5V4.5ZM5.5 4C5.22386 4 5 4.22386 5 4.5V19.5C5 19.7761 5.22386 20 5.5 20H18V4H5.5ZM7 7H16V9H7V7ZM7 11H16V13H7V11ZM7 15H13V17H7V15Z",
        color: "from-orange-500/20 to-amber-600/20 text-orange-500",
    },
    {
        name: "database.fish",
        path: "/db/fish",
        desc: "database.fish_desc",
        icon: "M10.625 3.176c1.945-1.402 4.675-2.507 6.976-1.491-0.407 1.431-0.49 3.151 0.93 4.087 4.529 3.742 4.788 11.458 0.336 15.349 2.043-3.638 0.11-9.248-4.303-9.771 0.303 0.745 0.728 1.925-0.297 2.317-2.064 0.588-4.134-0.567-5.765-1.746-2.227 0.383-5.26-0.312-6.151-2.581 1.129-3.475 4.773-5.655 8.274-6.163zM8.109 16.012c0.835-0.258 1.663-0.529 2.489-0.808-0.692 4.297 4.9 7.068 8.093 4.292-3.543 6.522-13.944 5.283-16.507-1.473 1.583-0.535 3.166-1.075 4.755-1.592 0.579 0.959 1.206 1.919 2.124 2.593-0.362-0.989-0.843-1.948-0.953-3.012z",
        color: "from-teal-500/20 to-cyan-600/20 text-teal-500",
    },
    {
        name: "database.shop",
        path: "/db/shop",
        desc: "database.shop_desc",
        icon: "M6.993 7.346c-0.63-3.203 1.458-6.965 5.007-6.897 3.546-0.078 5.637 3.694 5.007 6.897 0.937 0.006 1.871 0.010 2.809 0.016 0.485 5.197 1.096 10.382 1.503 15.585-6.212-0.003-12.424-0.003-18.636 0 0.41-5.204 1.018-10.388 1.503-15.585 0.934-0.006 1.871-0.010 2.809-0.016zM8.732 7.336c2.178 0.023 4.357 0.023 6.535 0 0.349-2.214-0.624-5.097-3.268-5.091-2.644-0.003-3.614 2.877-3.268 5.091zM6.706 15.494c2.576 0.886 4.341 2.721 5.294 5.252 0.953-2.528 2.718-4.367 5.294-5.249-2.55-0.957-4.367-2.731-5.294-5.304-0.928 2.573-2.744 4.35-5.294 5.301z",
        color: "from-blue-500/20 to-indigo-600/20 text-blue-500",
    },
    {
        name: "database.dynquest",
        path: "/db/dynquest",
        desc: "database.dynquest_desc",
        icon: "M10.6144 17.7956C10.277 18.5682 9.20776 18.5682 8.8704 17.7956L7.99275 15.7854C7.21171 13.9966 5.80589 12.5726 4.0523 11.7942L1.63658 10.7219C.868536 10.381.868537 9.26368 1.63658 8.92276L3.97685 7.88394C5.77553 7.08552 7.20657 5.60881 7.97427 3.75892L8.8633 1.61673C9.19319.821767 10.2916.821765 10.6215 1.61673L11.5105 3.75894C12.2782 5.60881 13.7092 7.08552 15.5079 7.88394L17.8482 8.92276C18.6162 9.26368 18.6162 10.381 17.8482 10.7219L15.4325 11.7942C13.6789 12.5726 12.2731 13.9966 11.492 15.7854L10.6144 17.7956ZM4.53956 9.82234C6.8254 10.837 8.68402 12.5048 9.74238 14.7996 10.8008 12.5048 12.6594 10.837 14.9452 9.82234 12.6321 8.79557 10.7676 7.04647 9.74239 4.71088 8.71719 7.04648 6.85267 8.79557 4.53956 9.82234ZM19.4014 22.6899 19.6482 22.1242C20.0882 21.1156 20.8807 20.3125 21.8695 19.8732L22.6299 19.5353C23.0412 19.3526 23.0412 18.7549 22.6299 18.5722L21.9121 18.2532C20.8978 17.8026 20.0911 16.9698 19.6586 15.9269L19.4052 15.3156C19.2285 14.8896 18.6395 14.8896 18.4628 15.3156L18.2094 15.9269C17.777 16.9698 16.9703 17.8026 15.956 18.2532L15.2381 18.5722C14.8269 18.7549 14.8269 19.3526 15.2381 19.5353L15.9985 19.8732C16.9874 20.3125 17.7798 21.1156 18.2198 22.1242L18.4667 22.6899C18.6473 23.104 19.2207 23.104 19.4014 22.6899ZM18.3745 19.0469 18.937 18.4883 19.4878 19.0469 18.937 19.5898 18.3745 19.0469Z",
        color: "from-green-500/20 to-emerald-600/20 text-green-500",
    },
    {
        name: "database.hardboss",
        path: "/db/hardboss",
        desc: "database.hardboss_desc",
        // icon: "M8.906 8.255c0.988-2.024 2.045-4.018 3.094-6.011 1.060 1.988 2.115 3.987 3.097 6.014-1.027 0.803-2.036 1.63-3.103 2.385-1.039-0.782-2.063-1.585-3.087-2.388z M0.008 6.928c1.824-0.839 3.66-1.66 5.557-2.33-0.776 0.703-1.476 1.512-1.86 2.5 2.736 1.809 5.527 3.539 8.296 5.293 2.772-1.754 5.563-3.487 8.299-5.296-0.391-0.985-1.091-1.791-1.863-2.497 1.9 0.673 3.745 1.491 5.572 2.339-1.373 1.988-2.812 3.93-4.239 5.881-1.776 1.106-3.636 2.079-5.402 3.206 1.424-0.148 2.833-0.403 4.251-0.576-2.194 2.121-4.39 4.242-6.617 6.326-2.227-2.085-4.427-4.203-6.614-6.326 1.418 0.173 2.824 0.427 4.245 0.576-1.763-1.127-3.624-2.097-5.399-3.203-1.415-1.957-2.884-3.884-4.224-5.893z",
        icon: "M9.767 6.1c0.94-1.947 1.393-4.104 2.233-6.1 0.837 1.999 1.296 4.15 2.227 6.103 1.181 1.327 2.842-0.17 4.162-0.496-0.316 1.305-1.552 2.614-0.961 3.986 1.184 1.287 3.362 1.327 4.555 2.407-1.187 1.077-3.371 1.123-4.555 2.407-0.584 1.372 0.645 2.677 0.961 3.986-1.32-0.332-2.979-1.832-4.159-0.496-0.934 1.953-1.393 4.104-2.23 6.103-0.84-1.999-1.296-4.156-2.233-6.11-1.174-1.363-2.842 0.192-4.159 0.502 0.313-1.257 1.378-2.443 1.056-3.779-1.019-1.555-3.45-1.46-4.646-2.617 1.211-1.153 3.621-1.059 4.646-2.608 0.313-1.333-0.73-2.531-1.059-3.785 1.324 0.323 2.985 1.838 4.162 0.496zM5.933 11.997c1.476 1.555 3.31 2.991 5.501 3.262 2.626 0.265 4.92-1.451 6.63-3.253-1.527-1.622-3.469-3.131-5.772-3.283-2.531-0.125-4.698 1.543-6.359 3.274z M11.175 9.977c1.667-0.825 3.672 1.181 2.851 2.848-0.514 1.412-2.553 1.853-3.569 0.721-1.132-1.022-0.694-3.052 0.718-3.569z",
        color: "from-red-500/20 to-orange-600/20 text-red-500",
    },
    {
        name: "database.questchain",
        path: "/db/questchain",
        desc: "database.questchain_desc",
        icon: "M0 12c5.070-2.705 9.28-6.93 12-11.991 2.72 5.061 6.93 9.283 12 11.991-5.070 2.708-9.28 6.93-12 11.991-2.72-5.061-6.93-9.283-12-11.991zM5.587 12c2.413 1.842 4.574 4 6.413 6.413 1.836-2.416 4.003-4.568 6.41-6.413-2.407-1.845-4.577-3.997-6.41-6.416-1.836 2.416-4 4.574-6.413 6.416z M8.475 12c1.452-0.866 2.66-2.077 3.525-3.528 0.862 1.455 2.077 2.663 3.525 3.528-1.449 0.869-2.663 2.074-3.525 3.528-0.866-1.455-2.077-2.66-3.525-3.528z",
        color: "from-purple-500/20 to-indigo-600/20 text-purple-500",
    },
    {
        name: "database.partytopic",
        path: "/db/partytopic",
        desc: "database.partytopic_desc",
        icon: "M4 6A2 2 0 0 1 6 4H18A2 2 0 0 1 20 6V18A2 2 0 0 1 18 20H6A2 2 0 0 1 4 18V6ZM7.75 8A.75.75 0 0 0 7 8.75V15.25C7 15.6642 7.33579 16 7.75 16H16.25A.75.75 0 0 0 17 15.25V8.75A.75.75 0 0 0 16.25 8H7.75ZM8.5 18.5A.5.5 0 0 1 9 18H15A.5.5 0 0 1 15 19H9A.5.5 0 0 1 8.5 18.5Z",
        color: "from-rose-500/20 to-red-600/20 text-rose-500",
    },
    {
        name: "database.achievement",
        path: "/db/achievement",
        desc: "database.achievement_desc",
        icon: "M5 3H19C19.5523 3 20 3.44772 20 4V8C20 9.65685 18.6569 11 17 11H15.5351C14.839 12.1956 13.6948 13.0958 12.3336 13.4303L13.0002 16H16V18H8V16H11.0002L11.6669 13.4303C10.3056 13.0958 9.16145 12.1956 8.46531 11H7C5.34315 11 4 9.65685 4 8V4C4 3.44772 4.44772 3 5 3ZM8 9V5H6V8C6 8.55228 6.44772 9 7 9H8ZM16 9H17C17.5523 9 18 8.55228 18 8V5H16V9ZM10 5V9C10 10.1046 10.8954 11 12 11C13.1046 11 14 10.1046 14 9V5H10Z",
        color: "from-yellow-500/20 to-amber-600/20 text-yellow-500",
    },
    {
        name: "database.npc",
        path: "/db/npc",
        desc: "database.npc_desc",
        icon: "M12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2ZM12.1597 16C10.1243 16 8.29182 16.8687 7.01276 18.2556C8.38039 19.3474 10.114 20 12 20C13.9695 20 15.7727 19.2883 17.1666 18.1081C15.8956 16.8074 14.1219 16 12.1597 16ZM12 4C7.58172 4 4 7.58172 4 12C4 13.8106 4.6015 15.4807 5.61557 16.8214C7.25639 15.0841 9.58144 14 12.1597 14C14.6441 14 16.8933 15.0066 18.5218 16.6342C19.4526 15.3267 20 13.7273 20 12C20 7.58172 16.4183 4 12 4ZM12 5C14.2091 5 16 6.79086 16 9C16 11.2091 14.2091 13 12 13C9.79086 13 8 11.2091 8 9C8 6.79086 9.79086 5 12 5ZM12 7C10.8954 7 10 7.89543 10 9C10 10.1046 10.8954 11 12 11C13.1046 11 14 10.1046 14 9C14 7.89543 13.1046 7 12 7Z",
        color: "from-blue-500/20 to-sky-600/20 text-blue-500",
    },
    {
        name: "database.impr",
        path: "/db/impr",
        desc: "database.impr_desc",
        icon: "M4 4H20V20H4V4ZM7 7V17H17V7H7ZM9 9H15V11H9V9ZM9 13H15V15H9V13Z",
        color: "from-emerald-500/20 to-teal-600/20 text-emerald-500",
    },
]

type DatabaseItem = (typeof databaseItems)[number]

type DatabaseSectionConfig = {
    id: string
    title: string
    description: string
    badge: string
    accentClass: string
    paths: string[]
}

type SearchScopeOption = {
    id: string
    label: string
}

const globalSearchService = new GlobalSearchService()

const featuredPaths = ["/db/char", "/db/weapon", "/db/mod", "/db/map-local", "/db/questchain", "/db/dungeon"]

const databaseSectionConfigs: DatabaseSectionConfig[] = [
    {
        id: "build",
        title: "构筑与养成",
        description: "围绕角色培养、装备搭配与养成素材，适合从 Build 视角快速定位核心资料。",
        badge: "Build",
        accentClass: "bg-violet-500",
        paths: ["/db/char", "/db/weapon", "/db/resource", "/db/mod", "/db/damage", "/db/draft", "/db/pet", "/db/accessory"],
    },
    {
        id: "explore",
        title: "地图与探索",
        description: "聚合区域、副本、刷新点位与采集相关资料，优先服务跑图、采集和副本路线查询。",
        badge: "Explore",
        accentClass: "bg-emerald-500",
        paths: ["/db/shop", "/db/fish", "/db/map-local", "/db/dungeon", "/db/abyss", "/db/map", "/db/event", "/db/walnut"],
    },
    {
        id: "world",
        title: "任务与世界",
        description: "把 NPC、动态任务、话题、声望与图鉴类内容整理到同一层，降低世界观检索成本。",
        badge: "World",
        accentClass: "bg-sky-500",
        paths: ["/db/impr", "/db/npc", "/db/reputation", "/db/rank", "/db/questchain", "/db/dynquest", "/db/partytopic"],
    },
    {
        id: "challenge",
        title: "挑战与收藏",
        description: "面向首领、怪物、成就与称号等目标型内容，方便围绕挑战目标进行连续检索。",
        badge: "Challenge",
        accentClass: "bg-amber-500",
        paths: ["/db/monster", "/db/hardboss", "/db/achievement", "/db/title", "/db/book"],
    },
]

const databaseItemMap = new Map<string, DatabaseItem>(databaseItems.map(item => [item.path, item]))

const selectedSearchSectionIds = ref(databaseSectionConfigs.map(section => section.id))

const searchScopeOptions = computed<SearchScopeOption[]>(() => {
    return [
        { id: "all", label: "全部" },
        ...databaseSectionConfigs.map(section => ({
            id: section.id,
            label: section.title,
        })),
    ]
})

const isAllSearchSectionsSelected = computed(() => {
    return selectedSearchSectionIds.value.length === databaseSectionConfigs.length
})

const selectedSearchPaths = computed(() => {
    if (isAllSearchSectionsSelected.value) {
        return null
    }

    const pathSet = new Set<string>()

    for (const section of databaseSectionConfigs) {
        if (!selectedSearchSectionIds.value.includes(section.id)) {
            continue
        }

        for (const path of section.paths) {
            pathSet.add(path)
        }
    }

    return pathSet
})

/**
 * 实时计算搜索候选，按融合评分返回前若干条。
 */
const searchOptions = computed<DBGlobalSearchOption[]>(() => {
    const options = globalSearchService.search(searchKeyword.value)

    if (!selectedSearchPaths.value) {
        return options
    }

    return options.filter(option => selectedSearchPaths.value?.has(option.path))
})

/**
 * 生成搜索状态提示文案，兼顾空状态、命中状态与无结果状态。
 */
const searchStatusText = computed(() => {
    const searchScopeText = isAllSearchSectionsSelected.value ? "全部模块" : `已选 ${selectedSearchSectionIds.value.length} 个模块`

    if (!searchKeyword.value.trim()) {
        return `当前搜索范围：${searchScopeText}`
    }

    if (searchOptions.value.length) {
        return `${searchScopeText} · 已命中 ${searchOptions.value.length} 个结果`
    }

    return "没有找到匹配内容，试试角色、地图、任务、副本或怪物等关键词"
})

/**
 * 首页展示的核心统计数据，用于强化“资料库工作台”的整体感知。
 */
const liveStats = computed(() => {
    return [
        {
            label: "资料入口",
            value: `${databaseItems.length}`,
        },
        {
            label: "内容分区",
            value: `${databaseSectionConfigs.length}`,
        },
    ]
})

/**
 * 生成首页右侧的推荐入口，优先展示高频使用的核心资料。
 */
const featuredItems = computed(() => {
    return featuredPaths.map(path => databaseItemMap.get(path)).filter((item): item is DatabaseItem => item !== undefined)
})

/**
 * 将扁平入口重组为页面分区，形成更清晰的信息架构。
 */
const databaseSections = computed(() => {
    return databaseSectionConfigs.map(section => ({
        ...section,
        items: section.paths.map(path => databaseItemMap.get(path)).filter((item): item is DatabaseItem => item !== undefined),
    }))
})

/**
 * 将路由片段转换为更适合展示的短标签。
 */
function getItemPathLabel(path: string) {
    return path.replace(/^\/db\//, "").replaceAll("-", " · ")
}

/**
 * 判断指定搜索模块是否处于选中状态。
 */
function isSearchScopeSelected(scopeId: string) {
    if (scopeId === "all") {
        return isAllSearchSectionsSelected.value
    }

    return selectedSearchSectionIds.value.includes(scopeId)
}

/**
 * 一键切换为搜索全部模块。
 */
function selectAllSearchScopes() {
    selectedSearchSectionIds.value = databaseSectionConfigs.map(section => section.id)
}

/**
 * 切换单个搜索模块；若全部取消，则回退为全选。
 */
function toggleSearchScope(scopeId: string) {
    if (scopeId === "all") {
        selectAllSearchScopes()
        return
    }

    const isSelected = selectedSearchSectionIds.value.includes(scopeId)

    if (isSelected) {
        const nextSectionIds = selectedSearchSectionIds.value.filter(id => id !== scopeId)
        selectedSearchSectionIds.value = nextSectionIds.length ? nextSectionIds : databaseSectionConfigs.map(section => section.id)
        return
    }

    selectedSearchSectionIds.value = [...selectedSearchSectionIds.value, scopeId]
}

/**
 * 选择搜索候选并跳转，同时重置输入内容。
 */
function handleSelectSearchOption(option: DBGlobalSearchOption) {
    searchKeyword.value = ""
    navigateTo(option.path)
}
</script>

<template>
    <ScrollArea class="h-full">
        <div class="relative min-h-full overflow-hidden">
            <div class="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 pb-8 md:p-6 lg:p-8">
                <section class="glass-surface relative z-20 rounded-[28px] shadow-xl shadow-base-content/5">
                    <div class="relative grid gap-6 p-6 md:p-8 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.85fr)]">
                        <div class="space-y-6">
                            <div class="grid gap-3 md:grid-cols-2">
                                <div
                                    v-for="stat in liveStats"
                                    :key="stat.label"
                                    class="glass-subtle rounded-2xl p-4 shadow-sm shadow-base-content/5"
                                >
                                    <div class="text-xs font-medium uppercase tracking-[0.18em] text-base-content/45">{{ stat.label }}</div>
                                    <div class="mt-3 text-3xl font-black text-base-content">{{ stat.value }}</div>
                                </div>
                            </div>

                            <div class="glass-subtle relative z-30 rounded-3xl p-4 shadow-sm shadow-base-content/5 md:p-5">
                                <div class="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                    <div>
                                        <div class="text-sm font-semibold text-base-content">全局检索入口</div>
                                    </div>
                                </div>

                                <div class="mb-4 flex flex-wrap gap-2">
                                    <button
                                        v-for="scope in searchScopeOptions"
                                        :key="scope.id"
                                        type="button"
                                        class="rounded-full border px-3 py-1.5 text-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                                        :class="
                                            isSearchScopeSelected(scope.id)
                                                ? 'border-primary/70 bg-primary text-primary-content shadow-sm shadow-primary/20'
                                                : 'border-base-300/50 bg-base-100/25 text-base-content/75 backdrop-blur-md hover:border-primary/35 hover:bg-base-100/35 hover:text-base-content'
                                        "
                                        @click="toggleSearchScope(scope.id)"
                                    >
                                        {{ scope.label }}
                                    </button>
                                </div>

                                <DBGlobalSearchAutocomplete
                                    v-model="searchKeyword"
                                    :options="searchOptions"
                                    placeholder="搜索已选模块..."
                                    empty-text="未找到匹配的资料库条目"
                                    :max-visible="14"
                                    class="w-full"
                                    input-class="db-search-input"
                                    panel-class="db-search-panel"
                                    option-class="db-search-option"
                                    @select="handleSelectSearchOption"
                                />

                                <p class="mt-3 text-sm leading-6 text-base-content/60">{{ searchStatusText }}</p>
                            </div>
                        </div>

                        <div class="grid gap-4">
                            <div class="glass-subtle rounded-3xl p-5 shadow-sm shadow-base-content/5">
                                <div class="flex items-center justify-between gap-4">
                                    <div>
                                        <div class="text-sm font-semibold text-base-content">推荐入口</div>
                                    </div>
                                    <span class="badge badge-ghost badge-sm">{{ featuredItems.length }} 项</span>
                                </div>

                                <div class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                                    <button
                                        v-for="item in featuredItems"
                                        :key="item.path"
                                        type="button"
                                        class="glass-interactive group flex cursor-pointer items-center gap-3 rounded-2xl p-3 text-left transition-all duration-200 hover:border-primary/35 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                                        @click="navigateTo(item.path)"
                                    >
                                        <div
                                            class="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-base-300/80 bg-base-200/90 text-base-content shadow-sm shadow-base-content/5"
                                        >
                                            <svg class="relative h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                                                <path :d="item.icon" />
                                            </svg>
                                        </div>
                                        <div class="min-w-0 flex-1">
                                            <div class="truncate text-sm font-semibold text-base-content">{{ $t(item.name) }}</div>
                                            <div class="mt-1 truncate text-[11px] font-medium uppercase tracking-wide text-base-content/45">
                                                {{ getItemPathLabel(item.path) }}
                                            </div>
                                        </div>
                                        <svg
                                            class="h-4 w-4 shrink-0 text-base-content/35 transition-transform duration-200 group-hover:translate-x-0.5"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <div class="relative z-0 grid gap-6 xl:grid-cols-2">
                    <section
                        v-for="section in databaseSections"
                        :key="section.id"
                        class="glass-surface rounded-[28px] p-5 shadow-lg shadow-base-content/5 md:p-6"
                    >
                        <div class="flex flex-col gap-3 border-b border-base-300/70 pb-4 md:flex-row md:items-start md:justify-between">
                            <div>
                                <div class="flex items-center gap-3">
                                    <span class="h-3 w-3 rounded-full" :class="section.accentClass" />
                                    <span class="text-xs font-semibold uppercase tracking-[0.22em] text-base-content/45">{{
                                        section.badge
                                    }}</span>
                                </div>
                                <h2 class="mt-3 text-2xl font-bold text-base-content">{{ section.title }}</h2>
                            </div>
                            <span class="badge badge-ghost badge-lg shrink-0">{{ section.items.length }} 个入口</span>
                        </div>

                        <div class="mt-5 grid gap-4 md:grid-cols-2">
                            <button
                                v-for="item in section.items"
                                :key="item.path"
                                type="button"
                                class="glass-interactive group relative flex h-full cursor-pointer flex-col rounded-3xl p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-lg hover:shadow-base-content/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45"
                                @click="navigateTo(item.path)"
                            >
                                <div class="grid grid-cols-[56px_minmax(0,1fr)] items-start gap-4">
                                    <div
                                        class="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-base-300/80 bg-base-200/90 text-base-content shadow-sm shadow-base-content/10"
                                    >
                                        <svg class="relative h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
                                            <path :d="item.icon" />
                                        </svg>
                                    </div>

                                    <div class="min-w-0 flex h-full flex-col">
                                        <h3 class="line-clamp-1 text-lg font-semibold text-base-content">
                                            {{ $t(item.name) }}
                                        </h3>
                                        <div class="mt-1 line-clamp-1 text-[11px] font-medium uppercase tracking-wide text-base-content/45">
                                            {{ getItemPathLabel(item.path) }}
                                        </div>
                                    </div>
                                </div>

                                <div class="mt-3 flex items-end justify-between gap-3 text-sm text-base-content/62">
                                    <span class="block min-w-0 flex-1 leading-6">
                                        {{ $t(item.desc) }}
                                    </span>
                                    <span
                                        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-base-200/80 text-base-content/60 transition-transform duration-200 group-hover:translate-x-1"
                                    >
                                        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                                        </svg>
                                    </span>
                                </div>
                            </button>
                        </div>
                    </section>
                </div>

                <section
                    class="glass-subtle rounded-[28px] p-5 text-sm leading-7 text-base-content/60 shadow-sm shadow-base-content/5 md:p-6"
                >
                    <div class="text-sm font-semibold text-base-content">内容授权说明</div>
                    <p class="mt-3">除特别注明的内容外，本站文字内容遵循 CC BY-SA 3.0 协议，图片等媒体内容则遵循其原有协议。</p>
                    <p class="mt-2">
                        利用本站内容时，您必须给出适当署名，并提供指向本许可协议的链接，同时标明是否对原始作品作了修改；不得以任何方式暗示本站为您或您的使用背书。
                    </p>
                </section>
            </div>
        </div>
    </ScrollArea>
</template>

<style scoped>
.glass-surface,
.glass-subtle,
.glass-interactive {
    position: relative;
}

.glass-surface {
    border: 1px solid color-mix(in srgb, var(--color-base-content) 12%, transparent);
    background:
        linear-gradient(
            180deg,
            color-mix(in srgb, var(--color-base-100) 26%, transparent),
            color-mix(in srgb, var(--color-base-100) 14%, transparent)
        ),
        linear-gradient(135deg, rgb(255 255 255 / 0.16), transparent 42%);
    box-shadow:
        inset 0 1px 0 rgb(255 255 255 / 0.18),
        0 16px 40px rgb(15 23 42 / 0.1);
    backdrop-filter: blur(24px) saturate(150%);
}

.glass-subtle {
    border: 1px solid color-mix(in srgb, var(--color-base-content) 10%, transparent);
    background:
        linear-gradient(
            180deg,
            color-mix(in srgb, var(--color-base-100) 20%, transparent),
            color-mix(in srgb, var(--color-base-100) 10%, transparent)
        ),
        linear-gradient(135deg, rgb(255 255 255 / 0.12), transparent 46%);
    box-shadow:
        inset 0 1px 0 rgb(255 255 255 / 0.14),
        0 10px 28px rgb(15 23 42 / 0.08);
    backdrop-filter: blur(18px) saturate(145%);
}

.glass-interactive {
    border: 1px solid color-mix(in srgb, var(--color-base-content) 10%, transparent);
    background:
        linear-gradient(
            180deg,
            color-mix(in srgb, var(--color-base-100) 18%, transparent),
            color-mix(in srgb, var(--color-base-100) 8%, transparent)
        ),
        linear-gradient(135deg, rgb(255 255 255 / 0.1), transparent 48%);
    box-shadow:
        inset 0 1px 0 rgb(255 255 255 / 0.12),
        0 8px 24px rgb(15 23 42 / 0.07);
    backdrop-filter: blur(16px) saturate(140%);
}

.glass-interactive:hover {
    background:
        linear-gradient(
            180deg,
            color-mix(in srgb, var(--color-base-100) 24%, transparent),
            color-mix(in srgb, var(--color-base-100) 12%, transparent)
        ),
        linear-gradient(135deg, rgb(255 255 255 / 0.16), transparent 48%);
    box-shadow:
        inset 0 1px 0 rgb(255 255 255 / 0.18),
        0 14px 34px rgb(15 23 42 / 0.1);
}

::v-deep(.db-search-input) {
    border: 1px solid color-mix(in srgb, var(--color-base-content) 10%, transparent) !important;
    background: linear-gradient(
        180deg,
        color-mix(in srgb, var(--color-base-100) 32%, transparent),
        color-mix(in srgb, var(--color-base-100) 18%, transparent)
    ) !important;
    box-shadow:
        inset 0 1px 0 rgb(255 255 255 / 0.16),
        0 8px 20px rgb(15 23 42 / 0.06);
    backdrop-filter: blur(18px) saturate(145%);
}

::v-deep(.db-search-panel) {
    position: relative;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--color-base-content) 10%, transparent) !important;
    background: linear-gradient(
        180deg,
        color-mix(in srgb, var(--color-base-100) 32%, transparent),
        color-mix(in srgb, var(--color-base-100) 18%, transparent)
    ) !important;
    box-shadow:
        inset 0 1px 0 rgb(255 255 255 / 0.18),
        0 18px 36px rgb(15 23 42 / 0.1) !important;
    backdrop-filter: blur(22px) saturate(150%);
}

::v-deep(.db-search-option) {
    border-bottom-color: color-mix(in srgb, var(--color-base-content) 8%, transparent) !important;
}

::v-deep(.db-search-option:hover),
::v-deep(.db-search-option[data-active="true"]) {
    background: color-mix(in srgb, var(--color-base-100) 28%, transparent) !important;
}
</style>
