import { createFileRoute } from '@tanstack/react-router'
import { BoardPage } from '../components/BoardPage'

export const Route = createFileRoute('/board/$boardId')({ component: BoardPage })
