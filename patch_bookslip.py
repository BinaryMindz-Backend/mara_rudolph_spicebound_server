import re

with open('src/main/book-slip/book-slip.service.ts', 'r') as f:
    content = f.read()

# Add refresh method
refresh_method = '''
  private async refreshIncompleteSeriesIfNeeded(book: any): Promise<any> {
    if (book.seriesStatus !== SeriesStatus.INCOMPLETE && book.arcStatus !== SeriesStatus.INCOMPLETE) {
      return book;
    }

    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    const isOutdated = Date.now() - new Date(book.updatedAt).getTime() > THIRTY_DAYS_MS;
    
    if (!isOutdated) return book;

    this.logger.log(`🔹 Book ${book.id} is INCOMPLETE and >30 days old. Doing lightweight series refresh.`);

    const aliases = await this.prisma.bookAlias.findMany({ where: { bookId: book.id } });
    const googleId = aliases.find(a => a.type === BookAliasType.GOOGLE_VOLUME_ID)?.value;
    const openLibId = aliases.find(a => a.type === BookAliasType.OPEN_LIBRARY_ID)?.value;

    let googleData: ExternalBookData | undefined;
    let openLibraryData: ExternalBookData | undefined;

    if (googleId) {
      googleData = await this.googleBooks.fetchByVolumeId(googleId).catch(() => undefined);
    } else {
      googleData = await this.googleBooks.search(`${book.title} ${book.primaryAuthor}`).catch(() => undefined);
    }

    if (openLibId) {
      openLibraryData = await this.openLibrary.fetchById(openLibId).catch(() => undefined);
    } else {
      openLibraryData = await this.openLibrary.search(`${book.title} ${book.primaryAuthor}`).catch(() => undefined);
    }

    const merged = mergeExternalData(googleData, openLibraryData, undefined);
    
    const updates: any = {};
    if (book.seriesStatus === SeriesStatus.INCOMPLETE) {
      if (merged.seriesStatus === 'COMPLETE') updates.seriesStatus = SeriesStatus.COMPLETE;
      if (merged.seriesTotal && merged.seriesTotal > (book.seriesTotal || 0)) updates.seriesTotal = merged.seriesTotal;
    }

    if (Object.keys(updates).length > 0) {
      this.logger.log(`🔹 Updating book ${book.id} series info: ${JSON.stringify(updates)}`);
      return await this.prisma.book.update({
        where: { id: book.id },
        data: updates
      });
    }

    return await this.prisma.book.update({
      where: { id: book.id },
      data: { updatedAt: new Date() }
    });
  }
}
'''

content = content.replace('\n}\n', refresh_method)

# Inject call around line 185
block_1_old = '''    if (existingBook) {
      this.logger.log(
        `✅ Found existing book by external ID: ${existingBook.id} (no API calls needed)`,
      );
      const slip = await this.buildSlip(existingBook, false);
      return slip;
    }'''

block_1_new = '''    if (existingBook) {
      this.logger.log(
        `✅ Found existing book by external ID: ${existingBook.id} (no API calls needed)`,
      );
      existingBook = await this.refreshIncompleteSeriesIfNeeded(existingBook);
      const slip = await this.buildSlip(existingBook, false);
      return slip;
    }'''

content = content.replace(block_1_old, block_1_new)


# Inject call around line 280
block_2_old = '''    if (existingBook) {
      this.logger.log(
        `✅ Found existing book by title/author: ${existingBook.id} (no AI call)`,
      );
      // Update aliases if we discovered new IDs (e.g. from pasted Goodreads/Amazon URL)
      await this.updateAliasesIfNeeded(existingBook.id, merged, goodreadsId);
      const slip = await this.buildSlip(existingBook, false);
      return slip;
    }'''

block_2_new = '''    if (existingBook) {
      this.logger.log(
        `✅ Found existing book by title/author: ${existingBook.id} (no AI call)`,
      );
      // Update aliases if we discovered new IDs (e.g. from pasted Goodreads/Amazon URL)
      await this.updateAliasesIfNeeded(existingBook.id, merged, goodreadsId);
      existingBook = await this.refreshIncompleteSeriesIfNeeded(existingBook);
      const slip = await this.buildSlip(existingBook, false);
      return slip;
    }'''

content = content.replace(block_2_old, block_2_new)

with open('src/main/book-slip/book-slip.service.ts', 'w') as f:
    f.write(content)

