/**
 * Стол карточных игр — общий у покера и блэкджека: сцена с овалом сукна и
 * крупье во главе, оболочка страницы стола, карты, фишки, реплики крупье,
 * летящие предметы, места, окно посадки, меню и лобби-список, сокет стола и
 * «ушёл со страницы — встал из-за стола».
 *
 * Живёт в `widgets/`, а не в `views/poker-table/`, потому что его рисуют две
 * страницы игр. Правил ни одной игры внутри нет: что лежит в центре сукна и
 * на месте, игра передаёт сама.
 */
export { AnimatedNumber } from './components/AnimatedNumber';
export { BuyInDialog } from './components/BuyInDialog';
export { CardTable } from './components/CardTable';
export { ChipStack } from './components/ChipStack';
export { Dealer, DealerSay } from './components/Dealer';
export { Effects, stagePointOf, type Anchor, type Ghost } from './components/Effects';
export { CardBack, CardSlot, PlayingCard, type CardMotion } from './components/PlayingCard';
export { EmptySeat, SeatPlate } from './components/SeatPlate';
export { CHIP_COLORS, SUIT_COLORS, TableDefs } from './components/TableDefs';
export { TableMenu, type MenuToggle } from './components/TableMenu';
export { TableFrame, TableShell } from './components/TableShell';
export { TablesList } from './components/TablesList';
export { Toggle } from './components/Toggle';
export { chipsFor, DENOMS, type Denom } from './lib/chips';
export { betPoint, initials, seatPoint, slotOf, STAGE_TALL, STAGE_WIDE, type SeatPoint } from './lib/layout';
export { CENTER, COLLECT, DEAL_FLY, DEAL_STEP, DEALER, FLIP, offsetFrom, WIN_FLY } from './lib/motion';
export { standUp, useLeaveOnExit } from './model/useLeaveOnExit';
export { useSeatPoints } from './model/useSeatPoints';
export { useStageAspect } from './model/useStageAspect';
export { useTableSocket } from './model/useTableSocket';
