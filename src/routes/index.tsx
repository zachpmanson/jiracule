import { createFileRoute } from '@tanstack/react-router'
import { IndexPage } from '../components/IndexPage'

export const Route = createFileRoute('/')({ component: IndexPage })
